# Setup

## 1. Prerequisites

- Node.js 18.17+ (Next.js 14 requirement)
- A Firebase project (free Spark plan is fine to start)
- A Groq API key — <https://console.groq.com>

## 2. Firebase project

1. Open <https://console.firebase.google.com> and create a project.
2. **Authentication** → enable **Email/Password** and **Google** providers.
3. **Firestore Database** → create a database in production mode. Any region.
4. **Storage** → create a default bucket. Any region.
5. **Project settings → General → Your apps → Web**: register a web app. Copy the config values — you'll paste them into `.env.local`.
6. **Project settings → Service accounts → Generate new private key**: download the JSON. This is used by the server to verify ID tokens and read/write Firestore/Storage with admin privileges.

### Firestore rules

The server uses the Admin SDK and bypasses rules, but we still recommend locking down client access:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if false;   // clients never read Firestore directly
    }
  }
}
```

### Storage rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{allPaths=**} {
      allow read, write: if false;   // clients never read Storage directly
    }
  }
}
```

All Firestore and Storage access goes through the server-side Firebase Admin SDK, authenticated by your service account.

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```env
# ---- Firebase (client) ----
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# ---- Firebase (server) ----
# Paste the entire service-account JSON on one line. Keep the real newlines
# inside the "private_key" field escaped as \n.
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}

# ---- Groq ----
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile   # optional, this is the default
```

> **Tip:** On a server with Application Default Credentials (e.g. Google Cloud Run), you can omit `FIREBASE_SERVICE_ACCOUNT_JSON` and the Admin SDK will pick them up automatically.

## 4. Install & run

```bash
npm install
npm run dev
```

Visit <http://localhost:3000>. Sign up with email/password or Google, then:

1. **Connections** → add a Postgres/MySQL/MongoDB connection, or upload a CSV/XLSX.
2. **Chat** → pick the connection and ask a question.

## 5. Deployment

The app is a standard Next.js 14 App Router project — deploy anywhere that runs Node 18+: Vercel, Cloud Run, Fly, Railway, a plain VPS. Set the same environment variables in your host's dashboard.

DuckDB (used for querying uploaded files) is a native module. On Vercel, add `duckdb` to `serverComponentsExternalPackages` (already set in `next.config.js`) and pick a runtime that includes the binary. On other hosts, no extra config needed.
