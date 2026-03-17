import httpx
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException

router = APIRouter()
_cache: dict = {}
_TTL = timedelta(hours=1)


@router.get("/api/currency/rates")
async def get_rates(base: str = "USD"):
    base = base.upper()
    cached = _cache.get(base)
    if cached and datetime.utcnow() - cached["fetched_at"] < _TTL:
        return cached["data"]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"https://api.frankfurter.app/latest?from={base}")
            r.raise_for_status()
            data = r.json()
        _cache[base] = {"data": data, "fetched_at": datetime.utcnow()}
        return data
    except Exception:
        raise HTTPException(status_code=503, detail="Exchange rate service unavailable")


@router.get("/api/currency/convert")
async def convert(from_: str, to: str, amount: float):
    rates_data = await get_rates(from_.upper())
    rate = rates_data["rates"].get(to.upper())
    if not rate:
        raise HTTPException(status_code=400, detail=f"Unknown currency: {to}")
    return {
        "from": from_.upper(),
        "to": to.upper(),
        "amount": amount,
        "converted": round(amount * rate, 2),
        "rate": rate,
        "date": rates_data.get("date"),
    }
