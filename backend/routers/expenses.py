from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from bson import ObjectId
from core.deps import get_db, get_current_user
from models.expense import ExpenseCreate, expense_public
from services.split_engine import compute_splits
from services.audit import write_audit

router = APIRouter()


@router.post("/api/groups/{group_id}/expenses", status_code=201)
async def create_expense(group_id: str, body: ExpenseCreate, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _member_group(group_id, current_user, db)

    # Build payers list (normalize single-payer to payers array)
    if body.payers:
        payers = [p.model_dump() for p in body.payers]
        total_paid = sum(p["amount"] for p in payers)
        if abs(total_paid - body.amount) > 0.02:
            raise HTTPException(status_code=422, detail=f"Payers total ({total_paid}) must equal amount ({body.amount})")
        first_key = payers[0]["participant_key"]
        paid_by_id = first_key.split(":")[1] if ":" in first_key else first_key
        paid_by_username = payers[0].get("display_name", "")
    else:
        # Legacy single-payer
        payer_user = await db.users.find_one({"_id": ObjectId(body.paid_by)})
        if not payer_user:
            raise HTTPException(status_code=404, detail="Payer not found")
        paid_by_id = str(payer_user["_id"])
        paid_by_username = payer_user["username"]
        payers = [{"participant_key": f"uid:{paid_by_id}", "display_name": paid_by_username, "amount": body.amount}]

    discounts = [d.model_dump() for d in body.discounts] if body.discounts else None

    try:
        splits = compute_splits(
            body.split_type,
            body.amount,
            body.split_spec,
            tax_rate=body.tax_rate,
            tip_rate=body.tip_rate,
            round_to_peso=body.round_to_peso,
            discounts=discounts,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    doc = {
        "group_id": group["_id"],
        "description": body.description,
        "amount": body.amount,
        "currency": body.currency,
        "paid_by": ObjectId(paid_by_id) if ObjectId.is_valid(paid_by_id) else ObjectId(),
        "paid_by_username": paid_by_username,
        "payers": payers,
        "split_type": body.split_type,
        "splits": [
            {
                "participant_key": s.participant_key,
                "display_name": s.display_name,
                "share": s.share,
                "subtotal_share": s.subtotal_share,
                "tax_share": s.tax_share,
                "tip_share": s.tip_share,
                "discount": s.discount,
                "percentage": s.percentage,
                "items": s.items,
            }
            for s in splits
        ],
        "tax_rate": body.tax_rate,
        "tip_rate": body.tip_rate,
        "round_to_peso": body.round_to_peso,
        "is_settlement": False,
        "transaction_date": body.transaction_date.isoformat() if body.transaction_date else datetime.utcnow().date().isoformat(),
        "created_by": current_user["_id"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.expenses.insert_one(doc)
    doc["_id"] = result.inserted_id

    await write_audit(
        db, group["_id"], current_user,
        "expense.create", "expense",
        str(result.inserted_id), body.description,
        {"amount": body.amount, "currency": body.currency},
    )
    return expense_public(doc)


@router.get("/api/groups/{group_id}/expenses")
async def list_expenses(group_id: str, skip: int = 0, limit: int = 50, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _member_group(group_id, current_user, db)
    cursor = db.expenses.find({"group_id": group["_id"]}).sort("created_at", -1).skip(skip).limit(limit)
    return [expense_public(e) async for e in cursor]


@router.delete("/api/groups/{group_id}/expenses/{expense_id}", status_code=204)
async def delete_expense(group_id: str, expense_id: str, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _member_group(group_id, current_user, db)
    expense = await db.expenses.find_one({"_id": ObjectId(expense_id), "group_id": group["_id"]})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    is_owner = str(group["owner_id"]) == str(current_user["_id"])
    is_payer = str(expense["paid_by"]) == str(current_user["_id"])
    if not is_owner and not is_payer:
        raise HTTPException(status_code=403, detail="Only the payer or group owner can delete this expense")
    await db.expenses.delete_one({"_id": expense["_id"]})
    await write_audit(
        db, group["_id"], current_user,
        "expense.delete", "expense",
        str(expense["_id"]), expense["description"],
        {"amount": expense["amount"], "currency": expense.get("currency", "PHP")},
    )


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
