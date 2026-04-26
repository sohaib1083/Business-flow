"""Seed a Chinook-inspired demo SQLite database.

Run once after installing dependencies:

    python -m app.db.seed_demo

Creates `backend/demo.db` with a small but realistic e-commerce-flavoured
schema (customers, products, orders, order_items, refunds) and ~12 months of
synthetic data so the LLM pipeline has something interesting to query.
"""
from __future__ import annotations

import random
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from app.config import get_settings

random.seed(42)

COUNTRIES = ["USA", "UK", "Germany", "France", "Canada", "Australia", "India", "Brazil"]
PRODUCT_CATALOG = [
    ("Starter Plan",   29.0,  "subscription"),
    ("Growth Plan",    99.0,  "subscription"),
    ("Business Plan",  299.0, "subscription"),
    ("Enterprise Plan",999.0, "subscription"),
    ("Onboarding",     500.0, "service"),
    ("Training Pack",  250.0, "service"),
]
FIRST_NAMES = ["Alex", "Sam", "Jamie", "Taylor", "Jordan", "Morgan", "Casey", "Riley", "Avery", "Drew"]
LAST_NAMES  = ["Lee", "Patel", "Garcia", "Smith", "Khan", "Brown", "Wong", "Silva", "Müller", "Dubois"]


def _drop_and_create(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.executescript(
        """
        DROP TABLE IF EXISTS refunds;
        DROP TABLE IF EXISTS order_items;
        DROP TABLE IF EXISTS orders;
        DROP TABLE IF EXISTS products;
        DROP TABLE IF EXISTS customers;

        CREATE TABLE customers (
            id          INTEGER PRIMARY KEY,
            first_name  TEXT NOT NULL,
            last_name   TEXT NOT NULL,
            email       TEXT NOT NULL UNIQUE,
            country     TEXT NOT NULL,
            signup_date DATE NOT NULL
        );

        CREATE TABLE products (
            id       INTEGER PRIMARY KEY,
            name     TEXT NOT NULL,
            price    REAL NOT NULL,
            category TEXT NOT NULL
        );

        CREATE TABLE orders (
            id          INTEGER PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            created_at  DATE NOT NULL,
            status      TEXT NOT NULL,
            amount      REAL NOT NULL
        );

        CREATE TABLE order_items (
            id         INTEGER PRIMARY KEY,
            order_id   INTEGER NOT NULL REFERENCES orders(id),
            product_id INTEGER NOT NULL REFERENCES products(id),
            quantity   INTEGER NOT NULL,
            unit_price REAL NOT NULL
        );

        CREATE TABLE refunds (
            id         INTEGER PRIMARY KEY,
            order_id   INTEGER NOT NULL REFERENCES orders(id),
            amount     REAL NOT NULL,
            reason     TEXT,
            created_at DATE NOT NULL
        );
        """
    )
    conn.commit()


def _seed_customers(conn: sqlite3.Connection, n: int = 80) -> list[int]:
    ids: list[int] = []
    cur = conn.cursor()
    today = date.today()
    for i in range(1, n + 1):
        fn = random.choice(FIRST_NAMES)
        ln = random.choice(LAST_NAMES)
        email = f"{fn.lower()}.{ln.lower()}{i}@example.com"
        country = random.choice(COUNTRIES)
        signup = today - timedelta(days=random.randint(30, 720))
        cur.execute(
            "INSERT INTO customers(id, first_name, last_name, email, country, signup_date) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (i, fn, ln, email, country, signup.isoformat()),
        )
        ids.append(i)
    conn.commit()
    return ids


def _seed_products(conn: sqlite3.Connection) -> list[tuple[int, float]]:
    cur = conn.cursor()
    rows: list[tuple[int, float]] = []
    for i, (name, price, cat) in enumerate(PRODUCT_CATALOG, start=1):
        cur.execute(
            "INSERT INTO products(id, name, price, category) VALUES (?, ?, ?, ?)",
            (i, name, price, cat),
        )
        rows.append((i, price))
    conn.commit()
    return rows


def _seed_orders(
    conn: sqlite3.Connection,
    customer_ids: list[int],
    products: list[tuple[int, float]],
) -> None:
    cur = conn.cursor()
    today = date.today()
    order_id = 0
    item_id = 0
    refund_id = 0

    # ~600 orders spread across the past 18 months
    for _ in range(600):
        order_id += 1
        cust = random.choice(customer_ids)
        days_ago = random.randint(0, 540)
        created = today - timedelta(days=days_ago)
        status = random.choices(
            ["completed", "completed", "completed", "completed", "pending", "cancelled"],
            k=1,
        )[0]

        # 1–3 line items per order
        line_count = random.randint(1, 3)
        chosen = random.sample(products, k=line_count)
        order_total = 0.0
        for pid, price in chosen:
            qty = random.randint(1, 3)
            unit = round(price * random.uniform(0.9, 1.0), 2)  # occasional discount
            order_total += qty * unit
            item_id += 1
            cur.execute(
                "INSERT INTO order_items(id, order_id, product_id, quantity, unit_price) "
                "VALUES (?, ?, ?, ?, ?)",
                (item_id, order_id, pid, qty, unit),
            )

        cur.execute(
            "INSERT INTO orders(id, customer_id, created_at, status, amount) "
            "VALUES (?, ?, ?, ?, ?)",
            (order_id, cust, created.isoformat(), status, round(order_total, 2)),
        )

        # 8% of completed orders get a partial refund
        if status == "completed" and random.random() < 0.08:
            refund_id += 1
            refund_amt = round(order_total * random.uniform(0.1, 0.5), 2)
            refund_date = created + timedelta(days=random.randint(1, 30))
            if refund_date > today:
                refund_date = today
            cur.execute(
                "INSERT INTO refunds(id, order_id, amount, reason, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    refund_id,
                    order_id,
                    refund_amt,
                    random.choice(["damaged", "wrong_item", "customer_request", "duplicate"]),
                    refund_date.isoformat(),
                ),
            )
    conn.commit()


def main() -> None:
    settings = get_settings()
    db_path: Path = settings.demo_db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    try:
        _drop_and_create(conn)
        customers = _seed_customers(conn)
        products = _seed_products(conn)
        _seed_orders(conn, customers, products)
        # Quick sanity print
        cur = conn.cursor()
        for table in ("customers", "products", "orders", "order_items", "refunds"):
            n = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  {table:12s} {n:>5d} rows")
        print(f"\n[ok] Seeded demo DB at {db_path} ({datetime.now().isoformat(timespec='seconds')})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
