# Setup

## Prerequisites
- **Python 3.10+** (3.11 recommended)
- **Node.js 18+**
- **Windows PowerShell**, macOS Terminal, or Linux shell

## 1. Environment variables

A `.env` already lives in the repo root with Groq + Firebase credentials. Schema:

```dotenv
# Groq
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile

# Firebase (client) — used by the Next.js app if you wire up auth later
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
# (and the rest)

# Firebase (server) — used by the FastAPI learning store
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

> If `FIREBASE_SERVICE_ACCOUNT_JSON` is missing or invalid, the backend
> automatically falls back to `backend/local_store.json` so the demo still
> runs.

## 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # (mac/linux: source .venv/bin/activate)
pip install -r requirements.txt

# One-time: seed the demo database
python -m app.db.seed_demo

# Run the API (use the helper to avoid a Py3.12 / httptools quirk on Windows)
.\run.bat
# or manually:
python -m uvicorn app.main:app --reload --port 8000 --http h11 --loop asyncio
```

Smoke test:

```powershell
curl http://localhost:8000/health
curl http://localhost:8000/api/schema
```

OpenAPI UI: http://localhost:8000/docs

## 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

By default the frontend talks to `http://localhost:8000`. Override with
`NEXT_PUBLIC_API_URL` if you deploy the backend elsewhere.

## 4. Connecting your own database (optional)

The demo SQLite DB is great for trying things out, but the platform is
built to point at your real PostgreSQL or MySQL. Two ways:

**UI** — open the app, click `+ New` in the **Connections** panel
(right sidebar), pick the dialect, fill host/port/db/user/pass. The
backend will run `SELECT 1` to verify before saving.

**API** — see [connections.md](connections.md) for a full curl example.
Passwords are encrypted at rest with Fernet (key in
`backend/.encryption.key`, gitignored).

To seed a fresh PG / MySQL with the same demo schema as the SQLite
sample (great for end-to-end testing):

```powershell
# Postgres on localhost:5432
python -m app.db.seed_external "postgresql+psycopg2://user:pass@localhost:5432/mydb"

# MySQL on localhost:3306
python -m app.db.seed_external "mysql+pymysql://user:pass@localhost:3306/mydb"
```

## 5. Resetting

- Delete `backend/demo.db` and re-run `python -m app.db.seed_demo` to refresh the demo DB.
- Delete `backend/local_store.json` to wipe local-mode learned metrics & history.
- Delete `backend/.encryption.key` to invalidate all stored connection
  passwords (forces re-entry).
- In Firebase, learned data lives at `workspaces/{id}/semantic_metrics` and
  `workspaces/{id}/query_history`.
