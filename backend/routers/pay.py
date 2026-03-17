"""Public payment / QR endpoints — no authentication required."""
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from core.deps import get_db
from fastapi import Depends

router = APIRouter()


@router.get("/api/pay/{user_id}")
async def pay_profile(user_id: str, db=Depends(get_db)):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    u = await db.users.find_one({"_id": oid}, {"username": 1, "gcash_qr": 1})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id": user_id,
        "username": u["username"],
        "has_gcash_qr": bool(u.get("gcash_qr")),
    }


@router.get("/api/pay/{user_id}/qr")
async def pay_qr(user_id: str, db=Depends(get_db)):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    u = await db.users.find_one({"_id": oid}, {"gcash_qr": 1})
    if not u or not u.get("gcash_qr"):
        raise HTTPException(status_code=404, detail="No GCash QR set")
    return {"data_url": u["gcash_qr"]}
