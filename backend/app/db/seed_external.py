"""Seed an arbitrary SQL database (SQLite/PostgreSQL/MySQL) with the demo data.

Used by the multi-DB test harness. Reuses the same schema shape as the
built-in SQLite demo so that the same NL questions work across all backends.

Usage:
    python -m app.db.seed_external sqlite:///path/to/file.db
    python -m app.db.seed_external postgresql+psycopg2://user:pass@host:5432/db
    python -m app.db.seed_external mysql+pymysql://user:pass@host:3306/db
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta

from sqlalchemy import (
    Column, Date, Float, ForeignKey, Integer, MetaData, String, Table,
    create_engine, text,
)


COUNTRIES = ["US", "UK", "DE", "FR", "IN", "BR", "JP", "CA"]
CATEGORIES = ["Hardware", "Software", "Services"]
PRODUCTS = [
    ("Widget Pro", "Hardware", 199.0),
    ("Widget Lite", "Hardware", 49.0),
    ("CloudSync", "Software", 29.0),
    ("AnalyticsPlus", "Software", 99.0),
    ("Onboarding Pkg", "Services", 1500.0),
    ("Premium Support", "Services", 500.0),
]


def _drop_all(engine):
    """Drop tables in FK-safe order across dialects."""
    is_pg = engine.dialect.name == "postgresql"
    with engine.begin() as conn:
        for tbl in ("refunds", "order_items", "orders", "products", "customers"):
            try:
                if is_pg:
                    conn.execute(text(f'DROP TABLE IF EXISTS "{tbl}" CASCADE'))
                else:
                    conn.execute(text(f"DROP TABLE IF EXISTS {tbl}"))
            except Exception:
                pass


def _build_metadata() -> MetaData:
    meta = MetaData()

    Table(
        "customers", meta,
        Column("id", Integer, primary_key=True),
        Column("name", String(120), nullable=False),
        Column("country", String(8), nullable=False),
        Column("signup_date", Date, nullable=False),
    )
    Table(
        "products", meta,
        Column("id", Integer, primary_key=True),
        Column("name", String(120), nullable=False),
        Column("category", String(40), nullable=False),
        Column("unit_price", Float, nullable=False),
    )
    Table(
        "orders", meta,
        Column("id", Integer, primary_key=True),
        Column("customer_id", Integer, ForeignKey("customers.id"), nullable=False),
        Column("order_date", Date, nullable=False),
        Column("amount", Float, nullable=False),
    )
    Table(
        "order_items", meta,
        Column("id", Integer, primary_key=True),
        Column("order_id", Integer, ForeignKey("orders.id"), nullable=False),
        Column("product_id", Integer, ForeignKey("products.id"), nullable=False),
        Column("quantity", Integer, nullable=False),
        Column("line_total", Float, nullable=False),
    )
    Table(
        "refunds", meta,
        Column("id", Integer, primary_key=True),
        Column("order_id", Integer, ForeignKey("orders.id"), nullable=False),
        Column("refund_date", Date, nullable=False),
        Column("amount", Float, nullable=False),
        Column("reason", String(80), nullable=False),
    )
    return meta


def seed(url: str, *, seed_value: int = 42) -> dict:
    rng = random.Random(seed_value)
    engine = create_engine(url, future=True)
    _drop_all(engine)
    meta = _build_metadata()
    meta.create_all(engine)

    customers = [
        {
            "id": i + 1,
            "name": f"Customer {i+1:03d}",
            "country": rng.choice(COUNTRIES),
            "signup_date": date(2024, 1, 1) + timedelta(days=rng.randint(0, 730)),
        }
        for i in range(80)
    ]
    products = [
        {"id": i + 1, "name": p[0], "category": p[1], "unit_price": p[2]}
        for i, p in enumerate(PRODUCTS)
    ]

    orders, order_items = [], []
    next_item_id = 1
    today = date(2026, 4, 26)
    for oid in range(1, 601):
        cust = rng.choice(customers)
        odate = today - timedelta(days=rng.randint(0, 720))
        # 1-4 line items per order
        items = []
        total = 0.0
        for _ in range(rng.randint(1, 4)):
            prod = rng.choice(products)
            qty = rng.randint(1, 5)
            line = round(prod["unit_price"] * qty, 2)
            total += line
            items.append({
                "id": next_item_id, "order_id": oid, "product_id": prod["id"],
                "quantity": qty, "line_total": line,
            })
            next_item_id += 1
        orders.append({
            "id": oid, "customer_id": cust["id"], "order_date": odate,
            "amount": round(total, 2),
        })
        order_items.extend(items)

    refunds = []
    for rid, ord_ in enumerate(rng.sample(orders, k=30), start=1):
        refunds.append({
            "id": rid,
            "order_id": ord_["id"],
            "refund_date": ord_["order_date"] + timedelta(days=rng.randint(1, 30)),
            "amount": round(ord_["amount"] * rng.uniform(0.3, 1.0), 2),
            "reason": rng.choice([
                "Defective", "Changed mind", "Late delivery", "Wrong item", "Other",
            ]),
        })

    with engine.begin() as conn:
        conn.execute(meta.tables["customers"].insert(), customers)
        conn.execute(meta.tables["products"].insert(), products)
        conn.execute(meta.tables["orders"].insert(), orders)
        conn.execute(meta.tables["order_items"].insert(), order_items)
        conn.execute(meta.tables["refunds"].insert(), refunds)

    return {
        "customers": len(customers),
        "products": len(products),
        "orders": len(orders),
        "order_items": len(order_items),
        "refunds": len(refunds),
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m app.db.seed_external <sqlalchemy_url>", file=sys.stderr)
        sys.exit(2)
    counts = seed(sys.argv[1])
    print("seeded:", counts)
