# Multi-database connector test suite.
# Verifies that the connector layer works across SQLite, PostgreSQL, and MySQL
# WITHOUT relying on the LLM (so it runs even when Groq is rate-limited).
#
# Pre-reqs:
#   - Backend running on http://localhost:8000
#   - Postgres on localhost:5555 (testuser/testpass/testdb), seeded
#   - MySQL on localhost:3307 (testuser/testpass/testdb), seeded
#
# Each test prints PASS/FAIL and the script exits non-zero on any failure.

$ErrorActionPreference = "Stop"
$base = "http://localhost:8000"
$pass = 0
$fail = 0
$createdIds = @()

function Step($label) { Write-Host "`n[*] $label" -ForegroundColor Cyan }
function Pass($msg)   { Write-Host "    [PASS] $msg" -ForegroundColor Green; $script:pass++ }
function Fail($msg)   { Write-Host "    [FAIL] $msg" -ForegroundColor Red;   $script:fail++ }

function Try-Step([string]$label, [scriptblock]$body) {
    Step $label
    try { & $body } catch { Fail $_.Exception.Message }
}

# --- 1. Built-in demo connection ---------------------------------------------
Try-Step "List connections (built-in demo present)" {
    $r = Invoke-RestMethod "$base/api/connections"
    $matches = @($r.connections | Where-Object { $_.id -eq 'demo' })
    if ($matches.Count -ne 1) {
        Fail "demo connection missing"; return
    }
    Pass "$($r.count) connection(s)"
}

Try-Step "Demo schema introspection (sqlite)" {
    $r = Invoke-RestMethod "$base/api/schema?connection_id=demo"
    if ($r.dialect -ne 'sqlite') { Fail "wrong dialect: $($r.dialect)"; return }
    if ($r.count -lt 5) { Fail "expected >=5 tables, got $($r.count)"; return }
    Pass "dialect=$($r.dialect), tables=$($r.count)"
}

# --- 2. Postgres ------------------------------------------------------------
$pgBody = @{
    name="pg-test"; dialect="postgresql"; host="localhost"; port=5555;
    database="testdb"; username="testuser"; password="testpass"; ssl=$false
} | ConvertTo-Json

Try-Step "Test arbitrary PostgreSQL credentials (no save)" {
    $r = Invoke-RestMethod "$base/api/connections/test" -Method POST -Body $pgBody -ContentType "application/json"
    if (-not $r.ok) { Fail "test failed: $($r.error)"; return }
    Pass "reached postgres ($($r.dialect))"
}

Try-Step "Create PostgreSQL connection (saved)" {
    $body = @{
        name="Demo Postgres"; connection_id="pg-demo"; dialect="postgresql";
        host="localhost"; port=5555; database="testdb";
        username="testuser"; password="testpass"; ssl=$false
    } | ConvertTo-Json
    $r = Invoke-RestMethod "$base/api/connections" -Method POST -Body $body -ContentType "application/json"
    if (-not $r.test.ok) { Fail "saved but test failed: $($r.test.error)"; return }
    if ($r.connection.has_password -ne $true) { Fail "password should be encrypted but flag missing"; return }
    $script:createdIds += $r.connection.id
    Pass "id=$($r.connection.id), encrypted password ok"
}

Try-Step "Postgres schema introspection" {
    $r = Invoke-RestMethod "$base/api/schema?connection_id=pg-demo"
    if ($r.dialect -ne 'postgresql') { Fail "wrong dialect"; return }
    $tableNames = ($r.tables | ForEach-Object { $_.table }) -join ','
    foreach ($t in @('customers','products','orders','order_items','refunds')) {
        if ($tableNames -notmatch $t) { Fail "missing table: $t"; return }
    }
    Pass "dialect=postgresql, tables=$tableNames"
}

# --- 3. MySQL ---------------------------------------------------------------
Try-Step "Create MySQL connection" {
    $body = @{
        name="Demo MySQL"; connection_id="mysql-demo"; dialect="mysql";
        host="localhost"; port=3307; database="testdb";
        username="testuser"; password="testpass"; ssl=$false
    } | ConvertTo-Json
    $r = Invoke-RestMethod "$base/api/connections" -Method POST -Body $body -ContentType "application/json"
    if (-not $r.test.ok) { Fail "test failed: $($r.test.error)"; return }
    $script:createdIds += $r.connection.id
    Pass "id=$($r.connection.id)"
}

Try-Step "MySQL schema introspection" {
    $r = Invoke-RestMethod "$base/api/schema?connection_id=mysql-demo"
    if ($r.dialect -ne 'mysql') { Fail "wrong dialect"; return }
    $tableNames = ($r.tables | ForEach-Object { $_.table }) -join ','
    foreach ($t in @('customers','products','orders','order_items','refunds')) {
        if ($tableNames -notmatch $t) { Fail "missing table: $t"; return }
    }
    Pass "dialect=mysql, tables=$tableNames"
}

# --- 4. Cross-dialect SQL execution + safety -------------------------------
# Drives the executor + sql_gen.validate_sql directly via a tiny test endpoint.
# Since we don't expose raw SQL execution publicly, we use the fact that
# /api/query also accepts a dialect-specific test path: we instead probe via
# a SELECT 1 style sanity check using the test-connection endpoint per saved.
Try-Step "Test saved postgres connection (round-trip)" {
    $r = Invoke-RestMethod "$base/api/connections/pg-demo/test" -Method POST
    if (-not $r.ok) { Fail "ping failed: $($r.error)"; return }
    Pass "ping ok"
}

Try-Step "Test saved mysql connection (round-trip)" {
    $r = Invoke-RestMethod "$base/api/connections/mysql-demo/test" -Method POST
    if (-not $r.ok) { Fail "ping failed: $($r.error)"; return }
    Pass "ping ok"
}

# --- 4b. End-to-end NL query across all three dialects ---------------------
# These hit the LLM. If Groq is rate-limited they will fail -- that's
# expected and not a connector regression.
function Try-NL([string]$connId, [string]$dialect) {
    Try-Step "NL query against $dialect ($connId)" {
        $body = @{ query = "how many customers do we have"; connection_id = $connId } | ConvertTo-Json
        try {
            $r = Invoke-RestMethod "$base/api/query" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 60
        } catch {
            Fail "request failed: $($_.Exception.Message)"; return
        }
        if (-not $r.ok) {
            if ($r.error -match 'rate.?limit|429|quota') {
                Write-Host "    [SKIP] Groq rate-limited: $($r.error)" -ForegroundColor Yellow
                return
            }
            Fail "pipeline failed: $($r.error)"; return
        }
        if ($r.connection_id -ne $connId) { Fail "wrong connection_id echoed: $($r.connection_id)"; return }
        if ($r.row_count -lt 1) { Fail "expected >=1 row, got $($r.row_count)"; return }
        Pass "rows=$($r.row_count) sql=$(($r.sql -replace '\s+',' ').Substring(0,[Math]::Min(60,$r.sql.Length)))..."
    }
}

Try-NL "demo" "sqlite"
Try-NL "pg-demo" "postgresql"
Try-NL "mysql-demo" "mysql"

# --- 5. Validation errors --------------------------------------------------
Try-Step "Reject unsupported dialect" {
    $body = @{ name="bad"; dialect="oracle"; database="x" } | ConvertTo-Json
    try {
        Invoke-RestMethod "$base/api/connections" -Method POST -Body $body -ContentType "application/json" | Out-Null
        Fail "should have rejected oracle"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) { Pass "rejected with 400" }
        else { Fail "wrong status: $($_.Exception.Response.StatusCode)" }
    }
}

Try-Step "Reject overwriting demo id" {
    $body = @{ name="x"; connection_id="demo"; dialect="sqlite"; database="/tmp/x.db" } | ConvertTo-Json
    try {
        Invoke-RestMethod "$base/api/connections" -Method POST -Body $body -ContentType "application/json" | Out-Null
        Fail "should have rejected reserved id"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) { Pass "rejected with 400" }
        else { Fail "wrong status: $($_.Exception.Response.StatusCode)" }
    }
}

Try-Step "Reject deletion of built-in demo" {
    try {
        Invoke-RestMethod "$base/api/connections/demo" -Method DELETE | Out-Null
        Fail "should have rejected delete demo"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) { Pass "rejected with 400" }
        else { Fail "wrong status: $($_.Exception.Response.StatusCode)" }
    }
}

Try-Step "Bad credentials report a clear error" {
    $body = @{ name="bad"; dialect="postgresql"; host="localhost"; port=5555;
               database="testdb"; username="wrong"; password="wrong" } | ConvertTo-Json
    $r = Invoke-RestMethod "$base/api/connections/test" -Method POST -Body $body -ContentType "application/json"
    if ($r.ok) { Fail "should have failed auth"; return }
    if ([string]::IsNullOrEmpty($r.error)) { Fail "no error message"; return }
    Pass "got error: $(($r.error -split "`n")[0])"
}

# --- 6. Cleanup -------------------------------------------------------------
Try-Step "Delete saved connections" {
    foreach ($id in $createdIds) {
        $r = Invoke-RestMethod "$base/api/connections/$id" -Method DELETE
        if (-not $r.deleted) { Fail "could not delete $id"; return }
    }
    Pass "deleted $($createdIds.Count) connection(s)"
}

# --- summary ----------------------------------------------------------------
Write-Host "`n========================================="
Write-Host "  PASSED: $pass"
Write-Host "  FAILED: $fail"
Write-Host "========================================="
if ($fail -gt 0) { exit 1 } else { exit 0 }
