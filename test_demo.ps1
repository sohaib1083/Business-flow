# BusinessFlow end-to-end smoke test.
# Usage: pwsh -File .\test_demo.ps1
$ErrorActionPreference = 'Stop'
$pass = 0
$fail = 0

function Step($name, $script) {
    Write-Host ""
    Write-Host "[*] $name" -ForegroundColor Cyan
    try {
        $r = & $script
        if ($null -ne $r) { Write-Host "    -> $r" -ForegroundColor Gray }
        Write-Host "    [PASS]" -ForegroundColor Green
        $script:pass++
    } catch {
        Write-Host "    [FAIL] $($_.Exception.Message)" -ForegroundColor Red
        $script:fail++
    }
}

# --- Read-only endpoints ---
Step "Backend /health" {
    $r = Invoke-RestMethod http://127.0.0.1:8000/health -TimeoutSec 5
    if ($r.status -ne 'ok') { throw "status=$($r.status)" }
    "status=$($r.status)"
}

Step "Storage backend in use" {
    (Invoke-RestMethod http://127.0.0.1:8000/api/storage/info -TimeoutSec 5).backend
}

Step "Schema introspection (5 tables expected)" {
    $r = Invoke-RestMethod http://127.0.0.1:8000/api/schema -TimeoutSec 5
    if ($r.count -ne 5) { throw "expected 5 tables, got $($r.count)" }
    "tables: " + (($r.tables | ForEach-Object { $_.table }) -join ', ')
}

Step "Suggestions list" {
    $r = Invoke-RestMethod http://127.0.0.1:8000/api/suggestions -TimeoutSec 5
    if ($r.suggestions.Count -lt 3) { throw "too few suggestions" }
    "$($r.suggestions.Count) suggestions"
}

Step "Frontend HTTP 200" {
    $r = Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing -TimeoutSec 30
    if ($r.StatusCode -ne 200) { throw "status=$($r.StatusCode)" }
    "HTTP 200 ($([Math]::Round($r.RawContentLength/1KB,1)) KB)"
}

# --- Pipeline queries ---
function RunQuery($q) {
    $body = @{ query = $q; workspace_id = 'demo' } | ConvertTo-Json -Compress
    Invoke-RestMethod http://127.0.0.1:8000/api/query -Method Post -Body $body `
        -ContentType 'application/json' -TimeoutSec 90
}

$queries = @(
    'What is total revenue by country?',
    'Top 5 customers by total spend',
    'How many orders were refunded last year?',
    'Which product category generates the most revenue?'
)

foreach ($q in $queries) {
    Step "Query: $q" {
        $r = RunQuery $q
        if (-not $r.ok) { throw "ok=false err=$($r.error)" }
        if (-not $r.sql) { throw "no SQL produced" }
        if ($null -eq $r.rows) { throw "no rows returned" }
        "rows=$($r.row_count)  ms=$($r.total_ms)  tables=$($r.tables_used -join ',')  metric=$($r.learned_metric.name)"
    }
}

# --- Learning loop ---
Step "Learned metrics persisted" {
    $r = Invoke-RestMethod http://127.0.0.1:8000/api/metrics?workspace_id=demo -TimeoutSec 5
    if ($r.count -lt 1) { throw "no metrics persisted" }
    "$($r.count) metrics: " + (($r.metrics | ForEach-Object { "$($_.name)($($_.usage_count)x)" }) -join ', ')
}

Step "Approve a learned metric" {
    $metrics = (Invoke-RestMethod http://127.0.0.1:8000/api/metrics?workspace_id=demo).metrics
    if ($metrics.Count -eq 0) { throw "nothing to approve" }
    $name = $metrics[0].name
    $body = @{ name = $name; workspace_id = 'demo' } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod http://127.0.0.1:8000/api/metrics/approve -Method Post -Body $body `
        -ContentType 'application/json' -TimeoutSec 5
    if ($r.metric.status -ne 'approved') { throw "not approved" }
    "approved metric: $($r.metric.name)"
}

Step "Query history populated" {
    $r = Invoke-RestMethod http://127.0.0.1:8000/api/history?workspace_id=demo -TimeoutSec 5
    if ($r.count -lt 1) { throw "history empty" }
    "$($r.count) entries"
}

# --- Safety: SQL injection attempt should be blocked ---
Step "SQL safety blocks DROP TABLE attempt" {
    $r = RunQuery 'Drop the orders table'
    # Two acceptable outcomes:
    #  - LLM refuses (no SQL produced) -> ok=false with a sensible error
    #  - LLM tries -> validate_sql blocks it
    # In either case, the orders table must still exist.
    $schema = Invoke-RestMethod http://127.0.0.1:8000/api/schema -TimeoutSec 5
    $tables = $schema.tables | ForEach-Object { $_.table }
    if ($tables -notcontains 'orders') { throw "orders table is GONE!" }
    "blocked safely (orders still present)"
}

# --- Summary ---
Write-Host ""
Write-Host "=========================================" -ForegroundColor White
Write-Host "  PASSED: $pass" -ForegroundColor Green
Write-Host "  FAILED: $fail" -ForegroundColor (@{$true='Red';$false='Green'}[$fail -gt 0])
Write-Host "=========================================" -ForegroundColor White
if ($fail -gt 0) { exit 1 }
