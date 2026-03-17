import random
from fastapi import APIRouter, File, UploadFile

router = APIRouter()

_MOCK_ITEMS = [
    ("Pizza Margherita", 18.99), ("Pasta Carbonara", 14.50), ("Caesar Salad", 9.99),
    ("House Wine (bottle)", 24.00), ("Garlic Bread", 4.50), ("Tiramisu", 8.75),
    ("Espresso x2", 5.25), ("Craft Beer", 7.00), ("Ribeye Steak", 32.00),
    ("French Onion Soup", 8.50), ("Nachos Platter", 11.99), ("Smash Burgers x2", 15.50),
]


@router.post("/api/receipts/upload")
async def upload_receipt(file: UploadFile = File(...)):
    """Mock OCR endpoint — returns plausible line items for UI demo."""
    n = random.randint(3, 6)
    items = random.sample(_MOCK_ITEMS, n)
    line_items = [{"description": name, "amount": price} for name, price in items]
    subtotal = round(sum(i["amount"] for i in line_items), 2)
    tax = round(subtotal * 0.08, 2)
    tip = round(subtotal * 0.18, 2)
    return {
        "filename": file.filename,
        "line_items": line_items,
        "subtotal": subtotal,
        "tax": tax,
        "tip": tip,
        "total": round(subtotal + tax + tip, 2),
        "note": "Mock OCR — Phase 2 will integrate Gemini Vision API",
    }
