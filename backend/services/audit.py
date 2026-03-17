from datetime import datetime
from bson import ObjectId


async def write_audit(
    db,
    group_id,
    actor: dict,
    action: str,
    target_type: str,
    target_id: str,
    target_name: str,
    metadata: dict | None = None,
):
    """Write an immutable audit log entry."""
    await db.audit_logs.insert_one({
        "group_id": group_id if isinstance(group_id, ObjectId) else ObjectId(str(group_id)),
        "actor_id": actor["_id"],
        "actor_name": actor["username"],
        "action": action,
        "target_type": target_type,
        "target_id": str(target_id),
        "target_name": target_name,
        "metadata": metadata or {},
        "created_at": datetime.utcnow(),
    })
