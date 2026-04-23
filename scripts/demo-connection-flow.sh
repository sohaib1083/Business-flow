#!/usr/bin/env bash
set -euo pipefail

# Demo script for Business Flow
# Runs end-to-end auth + connection test + optional connection create.
# Works against production or local app using BASE_URL.
#
# Required env:
#   NEXT_PUBLIC_FIREBASE_API_KEY
#   CONN_TYPE=POSTGRES|MYSQL|MONGODB
#
# Optional env:
#   BASE_URL (default: https://business-flow-demo-sohaib.vercel.app)
#   DEMO_EMAIL (default: demo.<epoch>@example.com)
#   DEMO_PASSWORD (default: TestPass123!)
#   DEMO_NAME (default: Demo User)
#   CONN_NAME (default: Demo Connection)
#   CREATE_CONNECTION=true|false (default: false)
#
# For POSTGRES/MYSQL:
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL
#
# For MONGODB:
#   DB_URI, DB_NAME

BASE_URL="${BASE_URL:-https://business-flow-demo-sohaib.vercel.app}"
DEMO_EMAIL="${DEMO_EMAIL:-demo.$(date +%s)@example.com}"
DEMO_PASSWORD="${DEMO_PASSWORD:-TestPass123!}"
DEMO_NAME="${DEMO_NAME:-Demo User}"
CONN_NAME="${CONN_NAME:-Demo Connection}"
CREATE_CONNECTION="${CREATE_CONNECTION:-false}"
CONN_TYPE="${CONN_TYPE:-POSTGRES}"

if [[ -z "${NEXT_PUBLIC_FIREBASE_API_KEY:-}" ]]; then
  echo "ERROR: NEXT_PUBLIC_FIREBASE_API_KEY is required"
  exit 1
fi

function require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: $name is required"
    exit 1
  fi
}

function print_step() {
  echo
  echo "==> $1"
}

function do_signup() {
  print_step "Signup user"
  local code
  code=$(curl -sS -o /tmp/bf_signup.json -w "%{http_code}" \
    -X POST "$BASE_URL/api/auth/signup" \
    -H "Content-Type: application/json" \
    --data-raw "{\"name\":\"$DEMO_NAME\",\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}")

  echo "signup_status=$code"
  cat /tmp/bf_signup.json

  if [[ "$code" != "201" && "$code" != "409" ]]; then
    echo "ERROR: signup failed"
    exit 1
  fi
}

function do_signin() {
  print_step "Sign in via Firebase"
  local code
  code=$(curl -sS -o /tmp/bf_signin.json -w "%{http_code}" \
    -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$NEXT_PUBLIC_FIREBASE_API_KEY" \
    -H "Content-Type: application/json" \
    --data-raw "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\",\"returnSecureToken\":true}")

  echo "signin_status=$code"
  if [[ "$code" != "200" ]]; then
    cat /tmp/bf_signin.json
    echo "ERROR: signin failed"
    exit 1
  fi

  ID_TOKEN=$(node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync("/tmp/bf_signin.json","utf8"));if(!d.idToken){console.error(JSON.stringify(d));process.exit(2)};process.stdout.write(d.idToken)')
  echo "token_ok=true"
}

function build_credentials_json() {
  case "$CONN_TYPE" in
    POSTGRES|MYSQL)
      require_env DB_HOST
      require_env DB_PORT
      require_env DB_NAME
      require_env DB_USER
      require_env DB_PASSWORD
      local ssl_json
      if [[ "${DB_SSL:-false}" == "true" ]]; then
        ssl_json=true
      else
        ssl_json=false
      fi
      echo "{\"host\":\"$DB_HOST\",\"port\":$DB_PORT,\"database\":\"$DB_NAME\",\"user\":\"$DB_USER\",\"password\":\"$DB_PASSWORD\",\"ssl\":$ssl_json}"
      ;;
    MONGODB)
      require_env DB_URI
      require_env DB_NAME
      echo "{\"uri\":\"$DB_URI\",\"database\":\"$DB_NAME\"}"
      ;;
    *)
      echo "ERROR: Unsupported CONN_TYPE=$CONN_TYPE"
      exit 1
      ;;
  esac
}

function test_connection() {
  print_step "Test connection credentials"
  CREDS_JSON=$(build_credentials_json)

  local code
  code=$(curl -sS -o /tmp/bf_conn_test.json -w "%{http_code}" \
    -X POST "$BASE_URL/api/connections/test" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ID_TOKEN" \
    --data-raw "{\"type\":\"$CONN_TYPE\",\"credentials\":$CREDS_JSON}")

  echo "test_status=$code"
  cat /tmp/bf_conn_test.json

  if [[ "$code" != "200" ]]; then
    echo "Connection test failed as expected or due to network restrictions."
    return 1
  fi

  return 0
}

function create_connection() {
  print_step "Create connection"
  local code
  code=$(curl -sS -o /tmp/bf_conn_create.json -w "%{http_code}" \
    -X POST "$BASE_URL/api/connections" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ID_TOKEN" \
    --data-raw "{\"name\":\"$CONN_NAME\",\"type\":\"$CONN_TYPE\",\"credentials\":$CREDS_JSON}")

  echo "create_status=$code"
  cat /tmp/bf_conn_create.json

  if [[ "$code" != "201" ]]; then
    echo "ERROR: create connection failed"
    exit 1
  fi
}

print_step "Business Flow demo flow"
echo "base_url=$BASE_URL"
echo "conn_type=$CONN_TYPE"
echo "email=$DEMO_EMAIL"

do_signup
do_signin

if test_connection; then
  if [[ "$CREATE_CONNECTION" == "true" ]]; then
    create_connection
  fi
else
  echo
  echo "Tip: If host is private (10.x/192.168.x/172.16-31.x), run app locally or expose DB securely."
fi

echo
echo "Done."
