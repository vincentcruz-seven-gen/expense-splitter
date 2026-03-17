from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from bson import ObjectId
from core.deps import get_db, get_current_user
from services.settlement_engine import calculate_net_balances, calculate_settlements

router = APIRouter()


def _build_participant_list(group: dict) -> list[dict]:
    """Build unified participant list from members + guests."""
    members = [
        {"participant_key": f"uid:{m['user_id']}", "display_name": m["username"]}
        for m in group.get("members", [])
    ]
    guests = [
        {"participant_key": f"gid:{g['guest_id']}", "display_name": g["display_name"]}
        for g in group.get("guests", [])
    ]
    return members + guests


def _display_name_map(group: dict) -> dict[str, str]:
    return {p["participant_key"]: p["display_name"] for p in _build_participant_list(group)}


@router.get("/api/groups/{group_id}/settlements")
async def get_settlements(group_id: str, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _member_group(group_id, current_user, db)
    expenses = await db.expenses.find({"group_id": group["_id"]}).to_list(None)
    participants = _build_participant_list(group)
    name_map = {p["participant_key"]: p["display_name"] for p in participants}

    net = calculate_net_balances(expenses, participants)
    debts = calculate_settlements(net)

    return {
        "debts": [
            {
                "from_participant_key": d["from"],
                "from_username": name_map.get(d["from"], d["from"]),
                "to_participant_key": d["to"],
                "to_username": name_map.get(d["to"], d["to"]),
                "amount": d["amount"],
            }
            for d in debts
        ],
        "balances": {name_map.get(k, k): round(v, 2) for k, v in net.items()},
    }


@router.post("/api/groups/{group_id}/settlements", status_code=201)
async def record_settlement(group_id: str, body: dict, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _member_group(group_id, current_user, db)
    name_map = _display_name_map(group)

    # Accept either new participant_key format or legacy user_id format
    from_key = body.get("from_participant_key") or f"uid:{body.get('from_user_id', '')}"
    to_key = body.get("to_participant_key") or f"uid:{body.get('to_user_id', '')}"
    amount = float(body["amount"])
    currency = body.get("currency", group.get("default_currency", "PHP"))

    from_name = name_map.get(from_key, from_key)
    to_name = name_map.get(to_key, to_key)

    # Resolve paid_by ObjectId (guests get a placeholder)
    from_oid = ObjectId(from_key.split(":")[1]) if from_key.startswith("uid:") and ObjectId.is_valid(from_key.split(":")[1]) else ObjectId()

    doc = {
        "group_id": group["_id"],
        "description": f"Settlement: {from_name} → {to_name}",
        "amount": amount,
        "currency": currency,
        "paid_by": from_oid,
        "paid_by_username": from_name,
        "payers": [{"participant_key": from_key, "display_name": from_name, "amount": amount}],
        "split_type": "equal",
        "splits": [{
            "participant_key": to_key,
            "display_name": to_name,
            "share": amount,
            "subtotal_share": amount,
            "tax_share": 0.0,
            "tip_share": 0.0,
            "discount": 0.0,
            "percentage": 100.0,
            "items": [],
        }],
        "tax_rate": 0.0,
        "tip_rate": 0.0,
        "round_to_peso": False,
        "is_settlement": True,
        "created_by": current_user["_id"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.expenses.insert_one(doc)
    return {"id": str(result.inserted_id), "recorded": True}


async def _member_group(group_id: str, current_user: dict, db) -> dict:
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID")
    group = await db.groups.find_one({"_id": oid})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not any(str(m["user_id"]) == str(current_user["_id"]) for m in group.get("members", [])):
        raise HTTPException(status_code=403, detail="Not a member")
    return group
