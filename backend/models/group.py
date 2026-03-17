from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    default_currency: str = "PHP"


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_currency: Optional[str] = None


class GuestAdd(BaseModel):
    display_name: str


def group_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "description": doc.get("description"),
        "default_currency": doc.get("default_currency", "PHP"),
        "owner_id": str(doc["owner_id"]),
        "members": [
            {
                "user_id": str(m["user_id"]),
                "username": m["username"],
                "role": m["role"],
                "joined_at": m.get("joined_at", datetime.utcnow()),
            }
            for m in doc.get("members", [])
        ],
        "guests": [
            {
                "guest_id": str(g["guest_id"]),
                "display_name": g["display_name"],
                "added_at": g.get("added_at", datetime.utcnow()),
            }
            for g in doc.get("guests", [])
        ],
        "created_at": doc.get("created_at", datetime.utcnow()),
    }
