from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional, Literal


class PayerEntry(BaseModel):
    participant_key: str  # "uid:<ObjectId>" or "gid:<ObjectId>"
    display_name: str
    amount: float


class DiscountEntry(BaseModel):
    participant_key: str
    amount: float


class ExpenseCreate(BaseModel):
    description: str
    amount: float
    currency: str = "PHP"
    paid_by: str  # kept for single-payer compat; overridden when payers is set
    payers: Optional[list[PayerEntry]] = None
    split_type: Literal["equal", "percentage", "itemized"]
    split_spec: dict
    tax_rate: float = 0.0
    tip_rate: float = 0.0
    round_to_peso: bool = False
    discounts: Optional[list[DiscountEntry]] = None
    transaction_date: Optional[date] = None


def expense_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "group_id": str(doc["group_id"]),
        "description": doc["description"],
        "amount": doc["amount"],
        "currency": doc.get("currency", "PHP"),
        "paid_by": str(doc["paid_by"]),
        "paid_by_username": doc.get("paid_by_username", ""),
        "payers": doc.get("payers", []),
        "split_type": doc["split_type"],
        "splits": [
            {
                "participant_key": s.get("participant_key", f"uid:{s.get('user_id', '')}"),
                "display_name": s.get("display_name", ""),
                "share": s["share"],
                "subtotal_share": s.get("subtotal_share", s["share"]),
                "tax_share": s.get("tax_share", 0.0),
                "tip_share": s.get("tip_share", 0.0),
                "discount": s.get("discount", 0.0),
                "percentage": s.get("percentage"),
                "items": s.get("items", []),
            }
            for s in doc.get("splits", [])
        ],
        "tax_rate": doc.get("tax_rate", 0.0),
        "tip_rate": doc.get("tip_rate", 0.0),
        "round_to_peso": doc.get("round_to_peso", False),
        "is_settlement": doc.get("is_settlement", False),
        "transaction_date": doc.get("transaction_date"),
        "created_at": doc.get("created_at", datetime.utcnow()),
    }
