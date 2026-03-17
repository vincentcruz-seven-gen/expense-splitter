# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SplitEase** — a full-stack expense splitting app. Users create groups, add expenses with multiple split strategies, and a min-cash-flow algorithm calculates the minimum transactions to settle all debts.

**Tech Stack:**
- **Frontend:** React 19 + Tailwind CSS v4 + Vite v8, deployed to Vercel (`expense-splitter-ui`)
- **Backend:** FastAPI + MongoDB (Motor async driver), deployed to Vercel (`expense-splitter-api`)
- **Auth:** JWT via `python-jose`, passwords hashed with `passlib[bcrypt]`

## Commands

### Backend (`/backend`)
```bash
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload          # dev server on :8000
pytest tests/ -v                   # all tests
pytest tests/test_settlements.py   # settlement algorithm tests
```

### Frontend (`/frontend`)
```bash
npm install
npm run dev      # Vite dev server on :5173, proxies /api → localhost:8000
npm run build
npm run lint
```

### Local full stack
```bash
# Terminal 1 — backend
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# Terminal 2 — frontend
cd frontend && npm run dev
```

## Architecture

### Backend structure

```
backend/
├── main.py              # FastAPI app + CORS + lifespan + router registration
├── api/index.py         # Vercel serverless entry (imports app from main.py)
├── core/
│   ├── config.py        # pydantic-settings (reads .env)
│   ├── security.py      # JWT encode/decode, bcrypt hash/verify
│   └── deps.py          # FastAPI deps: get_db, get_current_user
├── db/mongo.py          # Motor lifespan, MongoDB indexes
├── models/              # Pydantic models + serializer helpers (user, group, expense)
├── routers/             # auth, groups, expenses, settlements, receipts, currency
├── services/
│   ├── split_engine.py        # equal / percentage / itemized split logic
│   └── settlement_engine.py   # min-cash-flow debt simplification algorithm
└── tests/test_settlements.py  # 8 unit tests for settlement algorithm
```

**All API routes use `/api/` prefix** (e.g. `POST /api/auth/login`). This is consistent between local dev (Vite proxy passes `/api/...` as-is to uvicorn) and Vercel production (router forwards `/api/(.*)` to the FastAPI function).

**DB pattern:** `request.app.state.db` — Motor client attached via FastAPI lifespan, accessed via `get_db` dependency. Never use module-level globals.

**RBAC:** Inline checks in each router using `_member_group()` / `_owner_group()` helpers. Owner-only actions: update/delete group, add/remove members. Payer or owner can delete an expense.

### Key algorithms

**Split engine** (`services/split_engine.py`):
- `split_equal` — divides evenly, distributes remainder pennies to first N participants
- `split_percentage` — validates sum=100%, distributes remainder pennies
- `split_itemized` — per-item price divided among `consumer_ids`; same penny distribution
- All use `_distribute_pennies()` to guarantee `sum(shares) == amount` exactly

**Settlement engine** (`services/settlement_engine.py`):
- `calculate_net_balances(expenses, members)` — computes net per user (positive=owed, negative=owes)
- `calculate_settlements(net_balances)` — greedy min-cash-flow: repeatedly match largest creditor with largest debtor until all balances reach zero. Minimises transaction count.

### Frontend structure

```
frontend/src/
├── api/client.js          # fetch wrapper with JWT injection + 401 auto-logout
├── context/AuthContext.jsx # user state, login/logout, token in localStorage
├── components/
│   ├── ProtectedRoute.jsx  # redirects to /login if unauthenticated
│   ├── Navbar.jsx
│   └── AddExpenseSheet.jsx # bottom sheet: equal/percentage/itemized split UI + receipt scan
├── pages/
│   ├── LoginPage.jsx
│   ├── RegisterPage.jsx
│   ├── DashboardPage.jsx   # groups grid + create group modal
│   └── GroupDetailPage.jsx # expenses & settlements tabs, member management
└── App.jsx                 # React Router v6 route tree
```

**Auth flow:** JWT stored in `localStorage`. On app load, `AuthContext` calls `GET /api/auth/me` to validate the token. `ProtectedRoute` wraps all authenticated routes.

**Login uses OAuth2 form encoding** (`application/x-www-form-urlencoded`), not JSON — required by FastAPI's `OAuth2PasswordRequestForm`.

## Environment

Copy `backend/.env.example` → `backend/.env` and fill in:
```
MONGODB_URI=...
JWT_SECRET_KEY=<openssl rand -hex 32>
ALLOWED_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app
```

## Current Status

- Task 1 ✅ FastAPI + React wired, Vite proxy, root vercel.json
- Task 2 ✅ JWT auth, RBAC (owner/member), MongoDB with Motor
- Task 3 ✅ Split engine (equal/percentage/itemized), min-cash-flow settlements
- Task 4 ✅ Mock receipt upload, currency proxy (frankfurter.app)
- Task 5 ✅ Full React UI: login, register, dashboard, group detail, add expense bottom sheet

## Next Steps

- Connect real MongoDB URI in `.env` and test end-to-end
- Phase 2 OCR: replace mock receipt endpoint with Gemini Vision API
- Currency conversion display in group detail (show amounts in chosen currency)
- Add email notifications for settlements
