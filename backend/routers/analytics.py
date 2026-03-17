from fastapi import APIRouter, Depends
from datetime import datetime, timedelta
from bson import ObjectId
from core.deps import get_db, get_current_user

router = APIRouter()


def _week_label(year: int, week: int) -> str:
    """e.g. 'Mar 10-16'"""
    try:
        start = datetime.strptime(f"{year}-W{week:02d}-1", "%G-W%V-%u")
        end = datetime.strptime(f"{year}-W{week:02d}-7", "%G-W%V-%u")
        if start.month == end.month:
            return f"{start.strftime('%b')} {start.day}–{end.day}"
        return f"{start.strftime('%b %d')}"
    except Exception:
        return f"W{week}"


@router.get("/api/analytics")
async def get_analytics(db=Depends(get_db), current_user=Depends(get_current_user)):
    user_id = current_user["_id"]
    my_key = f"uid:{user_id}"

    # All groups this user belongs to
    groups = await db.groups.find(
        {"members": {"$elemMatch": {"user_id": user_id}}}
    ).to_list(None)

    if not groups:
        return {"weekly": [], "monthly": [], "stats": _empty_stats()}

    group_ids = [g["_id"] for g in groups]
    group_names = {g["_id"]: g["name"] for g in groups}

    # Expenses in the last 6 months (non-settlement)
    since = datetime.utcnow() - timedelta(days=183)
    expenses = await db.expenses.find({
        "group_id": {"$in": group_ids},
        "is_settlement": {"$ne": True},
        "created_at": {"$gte": since},
    }).to_list(None)

    weekly: dict = {}
    monthly: dict = {}
    group_totals: dict = {}

    for exp in expenses:
        dt: datetime = exp.get("created_at") or datetime.utcnow()
        amount: float = float(exp.get("amount", 0))
        my_split = next(
            (s for s in exp.get("splits", []) if s.get("participant_key") == my_key), None
        )
        my_share: float = float(my_split["share"]) if my_split else 0.0

        # ISO week key
        iso = dt.isocalendar()
        year, week = iso[0], iso[1]
        wk = f"{year}-W{week:02d}"
        if wk not in weekly:
            weekly[wk] = {"key": wk, "label": _week_label(year, week), "total": 0.0, "my_share": 0.0}
        weekly[wk]["total"] += amount
        weekly[wk]["my_share"] += my_share

        # Month key
        mk = dt.strftime("%Y-%m")
        if mk not in monthly:
            monthly[mk] = {"key": mk, "label": dt.strftime("%b %Y"), "total": 0.0, "my_share": 0.0}
        monthly[mk]["total"] += amount
        monthly[mk]["my_share"] += my_share

        # Group totals
        gname = group_names.get(exp.get("group_id"), "Other")
        group_totals[gname] = group_totals.get(gname, 0.0) + amount

    # Sort, take last 8 weeks and last 6 months
    sorted_weekly = sorted(weekly.values(), key=lambda x: x["key"])[-8:]
    sorted_monthly = sorted(monthly.values(), key=lambda x: x["key"])[-6:]

    for item in sorted_weekly + sorted_monthly:
        item["total"] = round(item["total"], 2)
        item["my_share"] = round(item["my_share"], 2)

    # Current-period stats
    now = datetime.utcnow()
    iso_now = now.isocalendar()
    curr_wk = f"{iso_now[0]}-W{iso_now[1]:02d}"
    curr_mk = now.strftime("%Y-%m")
    prev_mk = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

    tw = weekly.get(curr_wk, {})
    tm = monthly.get(curr_mk, {})
    pm = monthly.get(prev_mk, {})

    return {
        "weekly": sorted_weekly,
        "monthly": sorted_monthly,
        "stats": {
            "this_week_total": round(tw.get("total", 0), 2),
            "this_week_my_share": round(tw.get("my_share", 0), 2),
            "this_month_total": round(tm.get("total", 0), 2),
            "this_month_my_share": round(tm.get("my_share", 0), 2),
            "prev_month_total": round(pm.get("total", 0), 2),
            "prev_month_my_share": round(pm.get("my_share", 0), 2),
            "groups": {k: round(v, 2) for k, v in sorted(group_totals.items(), key=lambda x: -x[1])},
        },
    }


def _empty_stats():
    return {
        "this_week_total": 0,
        "this_week_my_share": 0,
        "this_month_total": 0,
        "this_month_my_share": 0,
        "prev_month_total": 0,
        "prev_month_my_share": 0,
        "groups": {},
    }
