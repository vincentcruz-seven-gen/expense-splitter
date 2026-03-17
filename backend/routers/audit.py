from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from core.deps import get_db, get_current_user

router = APIRouter()


@router.get("/api/groups/{group_id}/audit-logs")
async def get_audit_logs(group_id: str, skip: int = 0, limit: int = 50, db=Depends(get_db), current_user=Depends(get_current_user)):
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID")

    group = await db.groups.find_one({"_id": oid})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not any(str(m["user_id"]) == str(current_user["_id"]) for m in group.get("members", [])):
        raise HTTPException(status_code=403, detail="Not a member")

    cursor = db.audit_logs.find({"group_id": oid}).sort("created_at", -1).skip(skip).limit(limit)
    logs = []
    async for log in cursor:
        logs.append({
            "id": str(log["_id"]),
            "actor_name": log["actor_name"],
            "action": log["action"],
            "target_type": log["target_type"],
            "target_name": log["target_name"],
            "metadata": log.get("metadata", {}),
            "created_at": log["created_at"],
        })
    return logs
