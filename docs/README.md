# Buisness Flow

> Ask questions. Get answers from your data.

**Buisness Flow** is a chat-first analytics tool. Connect a database or upload a file, ask a question in plain English, and get back a concise summary — with an auto-picked chart or table when the data calls for it.

---

## At a glance

- **Auth & data:** Firebase (Auth, Firestore, Storage)
- **LLM:** Groq — `llama-3.3-70b-versatile` by default
- **App:** Next.js 14 App Router + TypeScript
- **Data sources:** PostgreSQL, MySQL, MongoDB, CSV, Excel
- **Roadmap:** Google Sheets, Microsoft SharePoint / Excel Online, more warehouses

---

## Documentation

| Doc                                  | What it covers                                     |
| ------------------------------------ | -------------------------------------------------- |
| [setup.md](./setup.md)               | Firebase project, Groq key, `.env`, local dev      |
| [architecture.md](./architecture.md) | Folder layout, request lifecycle, Firestore schema |
| [data-sources.md](./data-sources.md) | Supported connectors and how routing works         |
| [security.md](./security.md)         | Auth flow, SQL sanitizer, redaction rules          |

---

## Product principles

1. **The shortest path from question to answer.** No dashboards, no SQL editor, no "build a chart" wizard — just a chat.
2. **The LLM plans; the server executes.** The model proposes a structured query plan, the server compiles and validates it, then runs it against the real data source.
3. **Read-only by default.** Only `SELECT` is allowed. Destructive SQL never reaches a connector.
4. **Your data stays yours.** File uploads live in your Firebase Storage bucket under `users/{uid}/…`. Only rows we need for summarization go to Groq, and sensitive-looking columns are redacted first.

---

## Quick start

```bash
cp .env.example .env.local   # fill in Firebase + Groq values
npm install
npm run dev
```

Open <http://localhost:3000>, sign up, add a connection, ask a question.

Full setup → [setup.md](./setup.md).
