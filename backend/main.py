from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.mongo import lifespan
from core.config import settings
from routers import auth, groups, expenses, settlements, receipts, currency, audit, analytics, pay

app = FastAPI(title="Expense Splitter API", lifespan=lifespan)

origins = [o.strip() for o in settings.allowed_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(expenses.router)
app.include_router(settlements.router)
app.include_router(receipts.router)
app.include_router(currency.router)
app.include_router(audit.router)
app.include_router(analytics.router)
app.include_router(pay.router)


@app.get("/api/")
def health():
    return {"status": "ok"}
