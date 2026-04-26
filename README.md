# BusinessFlow — Working Demo

A query-driven, self-learning natural-language analytics layer over your database.

```
You ask:    "What was last month's revenue by country?"
We reply:   A short narrative + a chart + the SQL we ran + a learned metric you can approve.
```

This repo is a complete, runnable demo: **FastAPI backend + Next.js frontend + seeded SQLite demo DB + Groq LLM + Firebase storage** (with a local-JSON fallback so you can run it offline).

---

## Quick start (5 minutes)

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- Your `.env` already at the repo root (already provisioned with Groq + Firebase)

### 2. Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.db.seed_demo        # creates backend/demo.db with sample data
.\run.bat                          # or:  python -m uvicorn app.main:app --reload --port 8000 --http h11 --loop asyncio
```

> The `--http h11 --loop asyncio` flags avoid a known binary incompatibility
> between `httptools` and Python 3.12 on Windows. The `run.bat` helper sets
> them for you.

Backend is now at http://localhost:8000 — try http://localhost:8000/docs for the OpenAPI UI.

### 3. Frontend
In a second terminal:
```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and ask:
- *"What is total revenue by country?"*
- *"Top 5 customers by spend last year"*
- *"Average invoice value by month in 2024"*

---

## Project layout

```
business-flow-final/
├─ .env                    # Groq + Firebase secrets (gitignored)
├─ PLANNING.md             # Strategy, competitive landscape, roadmap
├─ README.md               # this file
├─ backend/                # FastAPI service
│  ├─ app/
│  │  ├─ main.py           # FastAPI entry
│  │  ├─ config.py         # env-loaded settings
│  │  ├─ api/routes.py     # REST endpoints
│  │  ├─ services/         # the pipeline
│  │  │  ├─ llm.py
│  │  │  ├─ schema.py
│  │  │  ├─ intent.py
│  │  │  ├─ discovery.py
│  │  │  ├─ semantic.py
│  │  │  ├─ sql_gen.py
│  │  │  ├─ executor.py
│  │  │  ├─ insight.py
│  │  │  └─ storage.py
│  │  └─ db/seed_demo.py   # creates demo.db
│  └─ requirements.txt
├─ frontend/               # Next.js 14 app router
│  ├─ app/
│  ├─ components/
│  └─ package.json
└─ docs/                   # all documentation
   ├─ architecture.md
   ├─ api.md
   ├─ setup.md
   ├─ learning-loop.md
   └─ security.md
```

See [docs/setup.md](docs/setup.md) for full configuration and [docs/architecture.md](docs/architecture.md) for the pipeline walkthrough.

---

## Security note

The `.env` you pasted contains real Groq and Firebase credentials. **Rotate them before pushing this repo anywhere public.** The `.gitignore` excludes `.env`, but the keys have already been visible in chat history.
