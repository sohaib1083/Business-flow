"""Public REST API."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import connections as conn_svc
from app.services import schema as schema_svc
from app.services import semantic, storage
from app.services.pipeline import run_query

router = APIRouter()


# ----- request / response models -----------------------------------------


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language question")
    workspace_id: str = Field(default="demo")
    connection_id: str = Field(default=conn_svc.DEMO_CONNECTION_ID)


class ApproveMetricRequest(BaseModel):
    name: str
    workspace_id: str = "demo"


class ConnectionRequest(BaseModel):
    name: str = Field(..., min_length=1)
    dialect: str = Field(..., description="sqlite | postgresql | mysql")
    database: str = Field(..., min_length=1)
    host: str = ""
    port: int = 0
    username: str = ""
    password: str = ""
    ssl: bool = False
    connection_id: str | None = None


class ConnectionTestRequest(BaseModel):
    name: str = "test"
    dialect: str
    database: str
    host: str = ""
    port: int = 0
    username: str = ""
    password: str = ""
    ssl: bool = False


# ----- pipeline / meta endpoints -----------------------------------------


@router.post("/query", tags=["pipeline"])
def query(req: QueryRequest) -> dict[str, Any]:
    """Run the full NL → insight pipeline for a single question."""
    return run_query(
        req.query,
        workspace_id=req.workspace_id,
        connection_id=req.connection_id,
    )


@router.get("/schema", tags=["meta"])
def get_schema(connection_id: str = conn_svc.DEMO_CONNECTION_ID) -> dict[str, Any]:
    """Return the introspected schema of the given database connection."""
    if conn_svc.get_connection(connection_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown connection: {connection_id}")
    try:
        tables = schema_svc.schema_for_prompt(connection_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Schema introspection failed: {exc}") from exc
    return {
        "connection_id": connection_id,
        "dialect": schema_svc.get_dialect(connection_id),
        "tables": tables,
        "count": len(tables),
    }


@router.get("/metrics", tags=["learning"])
def list_metrics(workspace_id: str = "demo") -> dict[str, Any]:
    metrics = semantic.get_known_metrics(workspace_id)
    metrics_sorted = sorted(metrics, key=lambda m: m.get("usage_count", 0), reverse=True)
    return {"metrics": metrics_sorted, "count": len(metrics_sorted)}


@router.post("/metrics/approve", tags=["learning"])
def approve_metric(req: ApproveMetricRequest) -> dict[str, Any]:
    metric = semantic.approve_metric(req.name, workspace_id=req.workspace_id)
    if not metric:
        raise HTTPException(status_code=404, detail=f"Metric not found: {req.name}")
    return {"metric": metric}


@router.get("/history", tags=["learning"])
def list_history(workspace_id: str = "demo", limit: int = 20) -> dict[str, Any]:
    queries = storage.list_queries(workspace_id, limit=limit)
    return {"queries": queries, "count": len(queries)}


@router.get("/suggestions", tags=["meta"])
def suggestions() -> dict[str, Any]:
    """Static demo suggestions tailored to the seeded schema."""
    return {
        "suggestions": [
            "What is total revenue by country?",
            "Top 5 customers by total spend",
            "Average invoice value by month in the last 12 months",
            "How many new customers signed up each month last year?",
            "Which product category generates the most revenue?",
            "What percentage of orders were refunded?",
        ]
    }


@router.get("/storage/info", tags=["meta"])
def storage_info() -> dict[str, str]:
    return {"backend": storage.backend_in_use()}


# ----- connections -------------------------------------------------------


@router.get("/connections", tags=["connections"])
def list_connections() -> dict[str, Any]:
    items = conn_svc.list_connections()
    return {"connections": items, "count": len(items)}


@router.post("/connections", tags=["connections"], status_code=201)
def create_connection(req: ConnectionRequest) -> dict[str, Any]:
    try:
        record = conn_svc.create_connection(
            name=req.name,
            dialect=req.dialect,
            database=req.database,
            host=req.host,
            port=req.port,
            username=req.username,
            password=req.password,
            ssl=req.ssl,
            connection_id=req.connection_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    full = conn_svc.get_connection(record["id"])
    test = conn_svc.test_connection(full) if full else {"ok": False, "error": "not found"}
    schema_svc.invalidate(record["id"])
    return {"connection": record, "test": test}


@router.delete("/connections/{connection_id}", tags=["connections"])
def delete_connection(connection_id: str) -> dict[str, Any]:
    try:
        deleted = conn_svc.delete_connection(connection_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Unknown connection: {connection_id}")
    schema_svc.invalidate(connection_id)
    return {"deleted": True, "connection_id": connection_id}


@router.post("/connections/test", tags=["connections"])
def test_connection(req: ConnectionTestRequest) -> dict[str, Any]:
    """Test arbitrary connection params without persisting."""
    if req.dialect not in conn_svc.SUPPORTED_DIALECTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported dialect '{req.dialect}'. Choose: {', '.join(conn_svc.SUPPORTED_DIALECTS)}",
        )
    record = {
        "id": "_probe",
        "name": req.name,
        "dialect": req.dialect,
        "host": req.host,
        "port": req.port or (5432 if req.dialect == "postgresql" else 3306 if req.dialect == "mysql" else 0),
        "database": req.database,
        "username": req.username,
        "password_encrypted": conn_svc._encrypt(req.password) if req.password else "",
        "ssl": req.ssl,
    }
    return conn_svc.test_connection(record)


@router.post("/connections/{connection_id}/test", tags=["connections"])
def test_saved_connection(connection_id: str) -> dict[str, Any]:
    record = conn_svc.get_connection(connection_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Unknown connection: {connection_id}")
    return conn_svc.test_connection(record)
