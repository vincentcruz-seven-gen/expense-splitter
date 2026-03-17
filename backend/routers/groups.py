from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from bson import ObjectId
from core.deps import get_db, get_current_user
from models.group import GroupCreate, GroupUpdate, GuestAdd, group_public
from services.audit import write_audit

router = APIRouter()


@router.post("/api/groups", status_code=201)
async def create_group(body: GroupCreate, db=Depends(get_db), current_user=Depends(get_current_user)):
    uid = current_user["_id"]
    doc = {
        "name": body.name,
        "description": body.description,
        "default_currency": body.default_currency,
        "owner_id": uid,
        "members": [{"user_id": uid, "username": current_user["username"], "role": "owner", "joined_at": datetime.utcnow()}],
        "guests": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.groups.insert_one(doc)
    doc["_id"] = result.inserted_id
    return group_public(doc)


@router.get("/api/groups")
async def list_groups(db=Depends(get_db), current_user=Depends(get_current_user)):
    cursor = db.groups.find({"members.user_id": current_user["_id"]})
    return [group_public(g) async for g in cursor]


@router.get("/api/groups/{group_id}")
async def get_group(group_id: str, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _member_group(group_id, current_user, db)
    return group_public(group)


@router.patch("/api/groups/{group_id}")
async def update_group(group_id: str, body: GroupUpdate, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _owner_group(group_id, current_user, db)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.utcnow()
    await db.groups.update_one({"_id": group["_id"]}, {"$set": updates})
    group.update(updates)
    return group_public(group)


@router.delete("/api/groups/{group_id}", status_code=204)
async def delete_group(group_id: str, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _owner_group(group_id, current_user, db)
    await db.groups.delete_one({"_id": group["_id"]})
    await db.expenses.delete_many({"group_id": group["_id"]})
    await db.audit_logs.delete_many({"group_id": group["_id"]})


@router.post("/api/groups/{group_id}/members")
async def add_member(group_id: str, body: dict, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _owner_group(group_id, current_user, db)
    user = await db.users.find_one({"email": body.get("email")})
    if not user:
        raise HTTPException(status_code=404, detail="No user found with that email")
    if any(str(m["user_id"]) == str(user["_id"]) for m in group.get("members", [])):
        raise HTTPException(status_code=400, detail="User already a member")
    new_member = {"user_id": user["_id"], "username": user["username"], "role": "member", "joined_at": datetime.utcnow()}
    await db.groups.update_one({"_id": group["_id"]}, {"$push": {"members": new_member}})
    group["members"].append(new_member)
    await write_audit(db, group["_id"], current_user, "member.add", "member", str(user["_id"]), user["username"])
    return group_public(group)


@router.delete("/api/groups/{group_id}/members/{user_id}")
async def remove_member(group_id: str, user_id: str, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _owner_group(group_id, current_user, db)
    if user_id == str(current_user["_id"]):
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    member = next((m for m in group.get("members", []) if str(m["user_id"]) == user_id), None)
    await db.groups.update_one(
        {"_id": group["_id"]},
        {"$pull": {"members": {"user_id": ObjectId(user_id)}}},
    )
    group["members"] = [m for m in group["members"] if str(m["user_id"]) != user_id]
    await write_audit(db, group["_id"], current_user, "member.remove", "member", user_id, member["username"] if member else user_id)
    return group_public(group)


# ── Guest management ──────────────────────────────────────────────────────────

@router.post("/api/groups/{group_id}/guests", status_code=201)
async def add_guest(group_id: str, body: GuestAdd, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _member_group(group_id, current_user, db)  # any member can add guests
    guest = {
        "guest_id": ObjectId(),
        "display_name": body.display_name,
        "added_by": current_user["_id"],
        "added_at": datetime.utcnow(),
    }
    await db.groups.update_one({"_id": group["_id"]}, {"$push": {"guests": guest}})
    group.setdefault("guests", []).append(guest)
    await write_audit(db, group["_id"], current_user, "guest.add", "guest", str(guest["guest_id"]), body.display_name)
    return group_public(group)


@router.delete("/api/groups/{group_id}/guests/{guest_id}", status_code=204)
async def remove_guest(group_id: str, guest_id: str, db=Depends(get_db), current_user=Depends(get_current_user)):
    group = await _owner_group(group_id, current_user, db)
    # Guard: reject if guest is referenced in any expense
    gkey = f"gid:{guest_id}"
    used = await db.expenses.find_one({"group_id": group["_id"], "splits.participant_key": gkey})
    if used:
        raise HTTPException(status_code=400, detail="Cannot remove guest who has expenses in this group")
    guest = next((g for g in group.get("guests", []) if str(g["guest_id"]) == guest_id), None)
    await db.groups.update_one(
        {"_id": group["_id"]},
        {"$pull": {"guests": {"guest_id": ObjectId(guest_id)}}},
    )
    if guest:
        await write_audit(db, group["_id"], current_user, "guest.remove", "guest", guest_id, guest["display_name"])


# ── Helpers ───────────────────────────────────────────────────────────────────

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


async def _owner_group(group_id: str, current_user: dict, db) -> dict:
    group = await _member_group(group_id, current_user, db)
    if str(group["owner_id"]) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Owner only")
    return group
