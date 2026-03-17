from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime
import base64
from bson import ObjectId
from core.deps import get_db, get_current_user
from core.security import hash_password, verify_password, create_access_token
from models.user import UserRegister, UserPublic, Token, user_public

router = APIRouter()


@router.post("/api/auth/register", status_code=201)
async def register(body: UserRegister, db=Depends(get_db)):
    existing = await db.users.find_one(
        {"$or": [{"email": body.email}, {"username": body.username}]}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already taken")
    doc = {
        "username": body.username,
        "email": body.email,
        "hashed_password": hash_password(body.password),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return user_public(doc)


@router.post("/api/auth/login")
async def login(form: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    user = await db.users.find_one({"username": form.username})
    if not user or not verify_password(form.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(str(user["_id"]))
    return {"access_token": token, "token_type": "bearer"}


@router.get("/api/auth/me")
async def me(current_user=Depends(get_current_user)):
    return user_public(current_user)


@router.post("/api/auth/gcash-qr", status_code=204)
async def upload_gcash_qr(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 2 MB")
    encoded = base64.b64encode(data).decode()
    data_url = f"data:{file.content_type};base64,{encoded}"
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"gcash_qr": data_url, "updated_at": datetime.utcnow()}},
    )


@router.delete("/api/auth/gcash-qr", status_code=204)
async def delete_gcash_qr(current_user=Depends(get_current_user), db=Depends(get_db)):
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$unset": {"gcash_qr": ""}, "$set": {"updated_at": datetime.utcnow()}},
    )


@router.get("/api/users/{user_id}/gcash-qr")
async def get_gcash_qr(user_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    u = await db.users.find_one({"_id": oid}, {"gcash_qr": 1})
    if not u or not u.get("gcash_qr"):
        raise HTTPException(status_code=404, detail="No GCash QR set")
    return {"data_url": u["gcash_qr"]}
