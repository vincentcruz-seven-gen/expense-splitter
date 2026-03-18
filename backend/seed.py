#!/usr/bin/env python3
"""
Seed script for SplitEase development.

Run from the backend/ directory (with venv activated):
    python seed.py                      # seed dummy users + data
    python seed.py --user vincent       # also add your real account to all groups
    python seed.py --reset              # wipe seed data and re-seed
    python seed.py --reset --user you   # reset + add your real account
"""
import asyncio
import sys
import random
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import bcrypt

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "expense_splitter")

SEED_USERNAMES = ["alice", "bob", "carol"]


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def ago(weeks=0, days=0, hours=0) -> datetime:
    return datetime.utcnow() - timedelta(weeks=weeks, days=days, hours=hours)


BARKADA_EXPENSES = [
    ("Jollibee Family Dinner", 1240),
    ("Grab rides to BGC", 380),
    ("Samgyupsal night", 2700),
    ("Inihaw sa Sugba (Cebu)", 1900),
    ("McDonald's merienda run", 650),
    ("Milktea + desserts", 840),
    ("Greenwich pizza party", 780),
    ("Bonchon chicken bucket", 1050),
    ("Boracay ferry tickets", 4200),
    ("Airbnb Tagaytay (2 nights)", 8400),
    ("Shawarma Brothers", 560),
    ("Dimsum Break SM", 620),
    ("Conti's brunch", 2100),
    ("Grocery run (Puregold)", 3800),
    ("Cinema tickets + popcorn", 1400),
    ("BBQ night sa bahay", 2200),
    ("Seafood market Dampa", 3100),
    ("Lomi House Batangas", 540),
    ("Goldilocks birthday cake", 890),
    ("Palawan Express send-off", 250),
]

BILLS_EXPENSES = [
    ("Meralco electric bill", 4200),
    ("PLDT Fibr monthly", 1699),
    ("Manila Water bill", 580),
    ("Condo association dues", 3500),
    ("Globe Postpaid plan", 999),
    ("Meralco electric bill", 3850),
    ("PLDT Fibr monthly", 1699),
    ("Manila Water bill", 620),
    ("Condo association dues", 3500),
    ("Netflix shared plan", 329),
    ("Meralco electric bill", 4500),
    ("PLDT Fibr monthly", 1699),
    ("Manila Water bill", 595),
    ("Condo association dues", 3500),
    ("Spotify Family Plan", 219),
]

WORK_EXPENSES = [
    ("Team lunch – Pesang Manok", 1350),
    ("Starbucks coffee round", 960),
    ("Office snacks (S&R)", 580),
    ("Team lunch – Mang Inasal", 1100),
    ("Grab Express docs delivery", 180),
    ("Birthday cake for Ate Nena", 750),
    ("Team lunch – Cabalen", 2800),
    ("Krispy Kreme + coffee", 820),
    ("Photocopy & printing", 310),
    ("Team lunch – Kuya J Resto", 1250),
    ("Pasalubong from Davao", 1100),
    ("Year-end potluck supplies", 2400),
]


def make_expense(group_id, payer_id, payer_username, desc, amount, members, created_at):
    n = len(members)
    share = round(amount / n, 2)
    shares = [share] * n
    shares[0] = round(amount - share * (n - 1), 2)  # absorb rounding
    splits = [
        {
            "participant_key": f"uid:{mid}",
            "display_name": uname,
            "share": s,
            "subtotal_share": s,
            "tax_share": 0.0,
            "tip_share": 0.0,
            "discount": 0.0,
            "percentage": round(100 / n, 4),
            "items": [],
        }
        for (mid, uname), s in zip(members, shares)
    ]
    return {
        "group_id": group_id,
        "description": desc,
        "amount": float(amount),
        "currency": "PHP",
        "paid_by": payer_id,
        "paid_by_username": payer_username,
        "payers": [{"participant_key": f"uid:{payer_id}", "display_name": payer_username, "amount": float(amount)}],
        "split_type": "equal",
        "splits": splits,
        "tax_rate": 0.0,
        "tip_rate": 0.0,
        "round_to_peso": False,
        "is_settlement": False,
        "created_by": payer_id,
        "created_at": created_at,
        "updated_at": created_at,
    }


async def seed(reset: bool = False, extra_username: str | None = None):
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]

    if reset:
        print("Resetting seed data...")
        existing_users = await db.users.find(
            {"username": {"$in": SEED_USERNAMES}}, {"_id": 1}
        ).to_list(None)
        user_ids = [u["_id"] for u in existing_users]
        if user_ids:
            groups = await db.groups.find(
                {"owner_id": {"$in": [str(uid) for uid in user_ids]}}, {"_id": 1}
            ).to_list(None)
            group_ids = [g["_id"] for g in groups]
            await db.expenses.delete_many({"group_id": {"$in": group_ids}})
            await db.groups.delete_many({"_id": {"$in": group_ids}})
            await db.users.delete_many({"username": {"$in": SEED_USERNAMES}})
        print("  Cleared.\n")

    existing = await db.users.find_one({"username": "alice"})
    if existing and not reset:
        # If only --user was requested, just patch the groups and exit
        if extra_username:
            real_user = await db.users.find_one({"username": extra_username})
            if not real_user:
                print(f"⚠ User '{extra_username}' not found")
            else:
                rid = real_user["_id"]
                rname = real_user["username"]
                groups = await db.groups.find(
                    {"members": {"$elemMatch": {"username": {"$in": SEED_USERNAMES}}}},
                    {"_id": 1, "name": 1}
                ).to_list(None)
                added = 0
                for g in groups:
                    already = await db.groups.find_one({"_id": g["_id"], "members.user_id": rid})
                    if not already:
                        await db.groups.update_one(
                            {"_id": g["_id"]},
                            {"$push": {"members": {"user_id": rid, "username": rname, "role": "member"}}},
                        )
                        print(f"  Added to '{g['name']}'")
                        added += 1
                    else:
                        print(f"  Already in '{g['name']}'")
                if added:
                    print(f"\n✓ '{rname}' added to {added} group(s)")
                else:
                    print(f"\n'{rname}' was already in all seed groups")
        else:
            print("Seed data already exists. Run with --reset to reseed.")
        client.close()
        return

    # ── Users ──────────────────────────────────────────────────
    print("Creating users...")
    now = datetime.utcnow()
    users = [
        {"username": u, "email": f"{u}@example.com",
         "hashed_password": hash_pw("password123"),
         "created_at": now, "updated_at": now}
        for u in SEED_USERNAMES
    ]
    res = await db.users.insert_many(users)
    alice_id, bob_id, carol_id = res.inserted_ids
    print(f"  alice ({alice_id}), bob ({bob_id}), carol ({carol_id})")

    def member(uid, uname, role="member"):
        return {"user_id": uid, "username": uname, "role": role}

    # ── Groups ─────────────────────────────────────────────────
    print("Creating groups...")
    group_docs = [
        {
            "name": "Barkada",
            "description": "Weekend hangouts, trips & food",
            "default_currency": "PHP",
            "owner_id": str(alice_id),
            "members": [member(alice_id, "alice", "owner"), member(bob_id, "bob"), member(carol_id, "carol")],
            "guests": [],
            "created_at": now, "updated_at": now,
        },
        {
            "name": "Bahay Bills",
            "description": "Monthly household expenses",
            "default_currency": "PHP",
            "owner_id": str(alice_id),
            "members": [member(alice_id, "alice", "owner"), member(bob_id, "bob")],
            "guests": [],
            "created_at": now, "updated_at": now,
        },
        {
            "name": "Work Lunches",
            "description": "Office food & shared work expenses",
            "default_currency": "PHP",
            "owner_id": str(bob_id),
            "members": [member(bob_id, "bob", "owner"), member(alice_id, "alice"), member(carol_id, "carol")],
            "guests": [],
            "created_at": now, "updated_at": now,
        },
    ]
    gres = await db.groups.insert_many(group_docs)
    barkada_id, bills_id, work_id = gres.inserted_ids
    print(f"  Barkada ({barkada_id}), Bahay Bills ({bills_id}), Work Lunches ({work_id})")

    # ── Expenses ───────────────────────────────────────────────
    print("Creating expenses...")
    barkada_m = [(alice_id, "alice"), (bob_id, "bob"), (carol_id, "carol")]
    bills_m   = [(alice_id, "alice"), (bob_id, "bob")]
    work_m    = [(bob_id, "bob"), (alice_id, "alice"), (carol_id, "carol")]

    expenses = []

    # Barkada: 20 expenses spread over 12 weeks
    for i, (desc, amount) in enumerate(BARKADA_EXPENSES):
        week_back = i % 12
        dt = ago(weeks=week_back, days=random.randint(0, 5), hours=random.randint(10, 20))
        payer = barkada_m[i % 3]
        expenses.append(make_expense(barkada_id, payer[0], payer[1], desc, amount, barkada_m, dt))

    # Bills: 15 expenses, 5 per month over 3 months
    for i, (desc, amount) in enumerate(BILLS_EXPENSES):
        month_back = i // 5
        dt = ago(days=month_back * 30 + random.randint(0, 4))
        payer = bills_m[i % 2]
        expenses.append(make_expense(bills_id, payer[0], payer[1], desc, amount, bills_m, dt))

    # Work: 12 expenses, roughly one per week
    for i, (desc, amount) in enumerate(WORK_EXPENSES):
        dt = ago(weeks=i, days=random.randint(1, 4), hours=random.randint(11, 13))
        payer = work_m[i % 3]
        expenses.append(make_expense(work_id, payer[0], payer[1], desc, amount, work_m, dt))

    await db.expenses.insert_many(expenses)
    print(f"  Inserted {len(expenses)} expenses across 3 groups")

    # ── Add real user to all groups if requested ───────────────
    if extra_username:
        real_user = await db.users.find_one({"username": extra_username})
        if not real_user:
            print(f"\n⚠ User '{extra_username}' not found — skipping")
        else:
            rid = real_user["_id"]
            rname = real_user["username"]
            all_group_ids = [barkada_id, bills_id, work_id]
            for gid in all_group_ids:
                already = await db.groups.find_one(
                    {"_id": gid, "members.user_id": rid}
                )
                if not already:
                    await db.groups.update_one(
                        {"_id": gid},
                        {"$push": {"members": member(rid, rname, "member")}},
                    )
            print(f"  Added '{rname}' ({rid}) to all 3 groups")

    print("\n✓ Done! Login with any of:")
    for u in SEED_USERNAMES:
        print(f"    {u} / password123")
    if extra_username:
        print(f"    {extra_username} / (your existing password)")

    client.close()


if __name__ == "__main__":
    reset = "--reset" in sys.argv
    extra = None
    if "--user" in sys.argv:
        idx = sys.argv.index("--user")
        if idx + 1 < len(sys.argv):
            extra = sys.argv[idx + 1]
        else:
            print("Usage: python seed.py --user <username>")
            sys.exit(1)
    asyncio.run(seed(reset=reset, extra_username=extra))
