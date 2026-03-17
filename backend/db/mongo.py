from contextlib import asynccontextmanager
from motor.motor_asyncio import AsyncIOMotorClient
from core.config import settings


@asynccontextmanager
async def lifespan(app):
    client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    app.state.db = client[settings.db_name]
    try:
        await app.state.db.users.create_index("email", unique=True)
        await app.state.db.users.create_index("username", unique=True)
        await app.state.db.groups.create_index("members.user_id")
        await app.state.db.expenses.create_index([("group_id", 1), ("created_at", -1)])
        await app.state.db.audit_logs.create_index([("group_id", 1), ("created_at", -1)])
    except Exception as e:
        print(f"[startup] MongoDB index creation skipped: {e}")
    yield
    client.close()
