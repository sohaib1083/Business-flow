Business Flow Demo Databases and Script

Use this with script:
scripts/demo-connection-flow.sh

Quick start

1) Export Firebase API key (from your env)
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_WEB_API_KEY

2) Run against production
BASE_URL=https://business-flow-demo-sohaib.vercel.app

3) Choose DB type and credentials
CONN_TYPE=POSTGRES or MYSQL or MONGODB

4) Run script
bash scripts/demo-connection-flow.sh

Optional: create saved connection after successful test
CREATE_CONNECTION=true bash scripts/demo-connection-flow.sh

Public/test database options for demos

Note: most truly public databases are unstable or get abused. For client demos, use quick free hosted instances that are publicly reachable.

Option A: Supabase (Postgres)
- Create a free project
- Use host, database, user, password from Project Settings > Database
- Usually requires SSL=true

Option B: Neon (Postgres)
- Create free project
- Use connection details from dashboard
- SSL=true recommended

Option C: Railway (Postgres or MySQL)
- Create DB service from template
- Use public host/port/user/password from variables panel

Option D: MongoDB Atlas M0 (MongoDB)
- Create free cluster
- Add database user
- Network Access: allow your runner (for demo you can use 0.0.0.0/0 temporarily)
- Use SRV URI in DB_URI and set DB_NAME

Example commands

Postgres example
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_KEY \
BASE_URL=https://business-flow-demo-sohaib.vercel.app \
CONN_TYPE=POSTGRES \
DB_HOST=YOUR_PUBLIC_DB_HOST \
DB_PORT=5432 \
DB_NAME=YOUR_DB \
DB_USER=YOUR_USER \
DB_PASSWORD=YOUR_PASS \
DB_SSL=true \
bash scripts/demo-connection-flow.sh

MySQL example
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_KEY \
BASE_URL=https://business-flow-demo-sohaib.vercel.app \
CONN_TYPE=MYSQL \
DB_HOST=YOUR_PUBLIC_DB_HOST \
DB_PORT=3306 \
DB_NAME=YOUR_DB \
DB_USER=YOUR_USER \
DB_PASSWORD=YOUR_PASS \
DB_SSL=false \
bash scripts/demo-connection-flow.sh

Mongo example
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_KEY \
BASE_URL=https://business-flow-demo-sohaib.vercel.app \
CONN_TYPE=MONGODB \
DB_URI='mongodb+srv://user:pass@cluster.example.mongodb.net/?retryWrites=true&w=majority' \
DB_NAME=sample_mflix \
bash scripts/demo-connection-flow.sh

For client private databases

If client DB is on private network (10.x, 192.168.x, 172.16-31.x), hosted Vercel cannot reach it directly.

Recommended client path:
1) Run Business Flow locally in client network.
2) Point connection to private DB directly.
3) Or expose DB through secure tunnel / bastion with strict allowlist.

Local run starter
npm install
npm run dev

Then run script against local app:
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_KEY \
BASE_URL=http://localhost:3000 \
CONN_TYPE=POSTGRES ... \
bash scripts/demo-connection-flow.sh
