from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    username: str
    email: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


def user_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "username": doc["username"],
        "email": doc["email"],
        "created_at": doc.get("created_at", datetime.utcnow()),
        "has_gcash_qr": bool(doc.get("gcash_qr")),
    }
