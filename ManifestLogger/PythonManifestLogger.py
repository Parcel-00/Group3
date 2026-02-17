#!/usr/bin/env python3
"""
Shipping Container Manifest Logger + Printer (standalone)

Key features:
- SQLite persistence for manifests, inventory, and scan logs
- Manifest "printing" to console and to a text file
- Anomaly percentage displayed in 20% increments (0..100)
  - Computed from scan logs when available
  - Otherwise uses a placeholder value (skeleton for wooden-block dot indicator / future vision integration)
- Batch generation of 20 blank templates

Designed to be independent (not yet linked to the wider YOLO/OCR project).
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sqlite3
from dataclasses import dataclass
from typing import Optional, List, Tuple

DB_DEFAULT = "manifests.db"


# -----------------------------
# Helpers: time, percentage, dots
# -----------------------------

def now_utc_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def clamp(n: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, n))


def quantise_to_20_percent(pct: float) -> int:
    """
    Quantise any percentage to the nearest 20% increment (0..100).
    Example: 33 -> 40, 29 -> 20, 91 -> 100.
    """
    pct = clamp(pct, 0.0, 100.0)
    # nearest multiple of 20
    return int(round(pct / 20.0) * 20)


def dots_indicator(percent_20: int) -> str:
    """
    Represent defect percentage using five "dots".
    - 0%  => 0 red, 5 green
    - 20% => 1 red, 4 green
    ...
    - 100% => 5 red, 0 green

    We avoid colored terminal output and use letters:
    R = defective, G = non-defective.
    """
    percent_20 = int(clamp(percent_20, 0, 100))
    red = percent_20 // 20
    green = 5 - red
    return ("R" * red) + ("G" * green)


# -----------------------------
# Database schema + access layer
# -----------------------------

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_utc TEXT NOT NULL,

    -- Header fields
    country_of_origin TEXT,
    port_of_loading TEXT,
    port_of_discharge TEXT,
    destination TEXT,
    container_id TEXT UNIQUE,
    iso_size_type TEXT,
    container_ownership TEXT,
    condition_at_first_receipt TEXT,
    tare_mass_kg REAL,
    max_gross_mass_kg REAL,

    -- Placeholder anomaly percentage (20% increments); used when scan totals are absent
    placeholder_anomaly_pct_20 INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_fk INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    item_code TEXT,
    quantity INTEGER NOT NULL,
    packaging_packages INTEGER,
    net_mass_kg REAL,
    gross_mass_kg REAL,
    FOREIGN KEY(container_fk) REFERENCES containers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_fk INTEGER NOT NULL,
    scanned_utc TEXT NOT NULL,
    qrCode TEXT NOT NULL,
    is_anomaly INTEGER NOT NULL, -- 0 or 1
    anomaly_type TEXT,
    notes TEXT,
    FOREIGN KEY(container_fk) REFERENCES containers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scan_container ON scan_logs(container_fk);
CREATE INDEX IF NOT EXISTS idx_inventory_container ON inventory_items(container_fk);
"""


def connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con


def init_db(db_path: str) -> None:
    con = connect(db_path)
    try:
        con.executescript(SCHEMA_SQL)
        con.commit()
    finally:
        con.close()


def get_container_pk(con: sqlite3.Connection, container_id: str) -> int:
    row = con.execute(
        "SELECT id FROM containers WHERE container_id = ?",
        (container_id.strip(),)
    ).fetchone()
    if not row:
        raise ValueError(f"Unknown Container ID: {container_id}")
    return int(row["id"])


def create_container(con: sqlite3.Connection, container_id: str) -> None:
    container_id = container_id.strip()
    if not container_id:
        raise ValueError("Container ID must not be blank.")
    con.execute(
        "INSERT INTO containers (created_utc, container_id) VALUES (?, ?)",
        (now_utc_iso(), container_id)
    )
    con.commit()


def update_header_field(con: sqlite3.Connection, container_id: str, field: str, value: str) -> None:
    allowed = {
        "country_of_origin",
        "port_of_loading",
        "port_of_discharge",
        "destination",
        "iso_size_type",
        "container_ownership",
        "condition_at_first_receipt",
        "tare_mass_kg",
        "max_gross_mass_kg",
    }
    if field not in allowed:
        raise ValueError(f"Field not supported: {field}")

    pk = get_container_pk(con, container_id)
    if field in {"tare_mass_kg", "max_gross_mass_kg"}:
        v = None if value.strip() == "" else float(value)
        con.execute(f"UPDATE containers SET {field} = ? WHERE id = ?", (v, pk))
    else:
        con.execute(f"UPDATE containers SET {field} = ? WHERE id = ?", (value, pk))
    con.commit()


def add_inventory_item(
    con: sqlite3.Connection,
    container_id: str,
    item_name: str,
    item_code: Optional[str],
    quantity: int,
    packaging_packages: Optional[int],
    net_mass_kg: Optional[float],
    gross_mass_kg: Optional[float],
) -> None:
    pk = get_container_pk(con, container_id)
    if not item_name.strip():
        raise ValueError("Item name must not be blank.")
    if quantity < 0:
        raise ValueError("Quantity must be non-negative.")
    con.execute(
        """
        INSERT INTO inventory_items
        (container_fk, item_name, item_code, quantity, packaging_packages, net_mass_kg, gross_mass_kg)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (pk, item_name.strip(), (item_code.strip() if item_code else None),
         int(quantity),
         (int(packaging_packages) if packaging_packages is not None else None),
         (float(net_mass_kg) if net_mass_kg is not None else None),
         (float(gross_mass_kg) if gross_mass_kg is not None else None))
    )
    con.commit()


def record_scan(
    con: sqlite3.Connection,
    container_id: str,
    qrCode: str,
    is_anomaly: bool,
    anomaly_type: Optional[str],
    notes: Optional[str],
) -> None:
    pk = get_container_pk(con, container_id)
    qrCode = qrCode.strip()
    if not qrCode:
        raise ValueError("QR code must not be blank.")
    con.execute(
        """
        INSERT INTO scan_logs
        (container_fk, scanned_utc, qrCode, is_anomaly, anomaly_type, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (pk, now_utc_iso(), qrCode, 1 if is_anomaly else 0,
         (anomaly_type.strip() if anomaly_type else None),
         (notes.strip() if notes else None))
    )
    con.commit()


def set_placeholder_anomaly_pct(con: sqlite3.Connection, container_id: str, pct: float) -> None:
    pk = get_container_pk(con, container_id)
    pct_20 = quantise_to_20_percent(pct)
    con.execute(
        "UPDATE containers SET placeholder_anomaly_pct_20 = ? WHERE id = ?",
        (pct_20, pk)
    )
    con.commit()


def fetch_manifest(con: sqlite3.Connection, container_id: str):
    pk = get_container_pk(con, container_id)

    header = con.execute(
        "SELECT * FROM containers WHERE id = ?",
        (pk,)
    ).fetchone()

    items = con.execute(
        """
        SELECT item_name, item_code, quantity, packaging_packages, net_mass_kg, gross_mass_kg
        FROM inventory_items
        WHERE container_fk = ?
        ORDER BY id ASC
        """,
        (pk,)
    ).fetchall()

    scans = con.execute(
        """
        SELECT scanned_utc, qrCode, is_anomaly, anomaly_type, notes
        FROM scan_logs
        WHERE container_fk = ?
        ORDER BY id ASC
        """,
        (pk,)
    ).fetchall()

    return header, items, scans


def compute_anomaly_pct_20(scans_rows, placeholder_pct_20: int) -> Tuple[int, str]:
    """
    Returns (percent_20, basis_string)
    basis_string indicates whether it was computed from scans or placeholder.
    """
    total = len(scans_rows)
    if total == 0:
        return int(placeholder_pct_20 or 0), "placeholder (manual / wooden-block indicator skeleton)"
    anomalies = sum(int(r["is_anomaly"]) for r in scans_rows)
    raw = (anomalies / total) * 100.0
    return quantise_to_20_percent(raw), f"computed from scans ({anomalies}/{total} anomaly scans)"


# -----------------------------
# Printing
# -----------------------------

def fmt(v) -> str:
    return "" if v is None else str(v)


def render_manifest_text(header, items_rows, scans_rows) -> str:
    placeholder_pct_20 = int(header["placeholder_anomaly_pct_20"] or 0)
    pct_20, basis = compute_anomaly_pct_20(scans_rows, placeholder_pct_20)
    dots = dots_indicator(pct_20)

    lines: List[str] = []

    lines.append("SHIPPING CONTAINER MANIFEST")
    lines.append("=" * 28)
    lines.append("")
    lines.append(f"Printed (UTC): {now_utc_iso()}")
    lines.append("")
    lines.append("Header")
    lines.append("-" * 6)
    lines.append(f"Country of origin: {fmt(header['country_of_origin'])}")
    lines.append(f"Port of loading: {fmt(header['port_of_loading'])}")
    lines.append(f"Port of discharge: {fmt(header['port_of_discharge'])}")
    lines.append(f"Destination: {fmt(header['destination'])}")
    lines.append(f"Container ID: {fmt(header['container_id'])}")
    lines.append(f"ISO size/type: {fmt(header['iso_size_type'])}")
    lines.append(f"Container ownership: {fmt(header['container_ownership'])}")
    lines.append(f"Condition at first receipt: {fmt(header['condition_at_first_receipt'])}")
    lines.append(f"Tare mass (kg): {fmt(header['tare_mass_kg'])}")
    lines.append(f"Max gross mass (kg): {fmt(header['max_gross_mass_kg'])}")
    lines.append("")
    lines.append("Anomaly / Defect indicator (20% increments)")
    lines.append("-" * 42)
    lines.append(f"Anomaly percentage (quantised): {pct_20}%")
    lines.append(f"Five-dot indicator (R=defect, G=non-defect): {dots}  (basis: {basis})")
    lines.append("")
    lines.append("Inventory")
    lines.append("-" * 9)

    if not items_rows:
        lines.append("(no inventory lines recorded)")
    else:
        for i, r in enumerate(items_rows, start=1):
            lines.append(f"{i}. Item: {fmt(r['item_name'])}")
            lines.append(f"   Item code: {fmt(r['item_code'])}")
            lines.append(f"   Quantity: {fmt(r['quantity'])}")
            lines.append(f"   Packaging: {fmt(r['packaging_packages'])}")
            lines.append(f"   Net mass (kg): {fmt(r['net_mass_kg'])}")
            lines.append(f"   Gross mass (kg): {fmt(r['gross_mass_kg'])}")
            lines.append("")

    lines.append("Scan log (qrCodes and anomalies)")
    lines.append("-" * 33)
    if not scans_rows:
        lines.append("(no scans recorded)")
    else:
        for r in scans_rows:
            flag = "ANOMALY" if int(r["is_anomaly"]) == 1 else "OK"
            at = r["scanned_utc"]
            bc = r["qrCode"]
            a_type = fmt(r["anomaly_type"])
            notes = fmt(r["notes"])
            if flag == "ANOMALY":
                lines.append(f"{at} | {bc} | {flag} | type: {a_type} | notes: {notes}")
            else:
                lines.append(f"{at} | {bc} | {flag}")

    lines.append("")
    lines.append("END OF MANIFEST")
    return "\n".join(lines)


def write_text_file(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def print_manifest(con: sqlite3.Connection, container_id: str, out_dir: str) -> str:
    header, items, scans = fetch_manifest(con, container_id)
    content = render_manifest_text(header, items, scans)

    safe_id = (container_id.strip().replace("/", "_").replace("\\", "_").replace(" ", "_") or "container")
    filename = f"manifest_{safe_id}.txt"
    out_path = os.path.join(out_dir, filename)

    write_text_file(out_path, content)
    return content, out_path


def generate_blank_templates(out_dir: str, count: int = 20) -> List[str]:
    """
    Creates 'count' blank manifest template files.
    These are forms, not database-backed manifests.
    """
    template = (
        "SHIPPING CONTAINER MANIFEST (BLANK TEMPLATE)\n"
        "==========================================\n\n"
        "Country of origin:\n"
        "Port of loading:\n"
        "Port of discharge:\n"
        "Destination:\n"
        "Container ID:\n"
        "ISO size/type:\n"
        "Container ownership:\n"
        "Condition at first receipt:\n"
        "Tare mass (kg):\n"
        "Max gross mass (kg):\n\n"
        "Inventory\n"
        "---------\n"
        "- Items:\n"
        "- Item codes:\n"
        "- Quantity:\n"
        "- Packaging:\n"
        "- Net mass (kg):\n"
        "- Gross mass (kg):\n"
    )

    os.makedirs(out_dir, exist_ok=True)
    paths: List[str] = []
    for i in range(1, count + 1):
        path = os.path.join(out_dir, f"blank_manifest_template_{i:02d}.txt")
        write_text_file(path, template)
        paths.append(path)
    return paths


# -----------------------------
# CLI
# -----------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Standalone shipping container manifest logger + printer (SQLite-backed)."
    )
    p.add_argument("--db", default=DB_DEFAULT, help="Path to SQLite database (default: manifests.db).")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init-db", help="Create/upgrade database schema.")

    pc = sub.add_parser("create-container", help="Create a new container record by Container ID.")
    pc.add_argument("container_id", help="Container ID (unique).")

    pu = sub.add_parser("set-header", help="Set a header field for a container.")
    pu.add_argument("container_id")
    pu.add_argument("field", help="One of: country_of_origin, port_of_loading, port_of_discharge, destination, "
                                  "iso_size_type, container_ownership, condition_at_first_receipt, tare_mass_kg, max_gross_mass_kg")
    pu.add_argument("value", help="Value to set (numbers for *_kg fields).")

    pi = sub.add_parser("add-item", help="Add an inventory line to a container.")
    pi.add_argument("container_id")
    pi.add_argument("--name", required=True, help="Item name/description.")
    pi.add_argument("--code", default=None, help="Item code (optional).")
    pi.add_argument("--qty", type=int, required=True, help="Quantity (integer).")
    pi.add_argument("--packages", type=int, default=None, help="No. of packages (optional).")
    pi.add_argument("--net-kg", type=float, default=None, help="Net mass in kg (optional).")
    pi.add_argument("--gross-kg", type=float, default=None, help="Gross mass in kg (optional).")

    ps = sub.add_parser("scan", help="Record a qrCode scan (OK or anomaly).")
    ps.add_argument("container_id")
    ps.add_argument("qrCode")
    ps.add_argument("--anomaly", action="store_true", help="Mark this scan as an anomaly/defect.")
    ps.add_argument("--type", default=None, help="Anomaly type/category (optional).")
    ps.add_argument("--notes", default=None, help="Free text notes (optional).")

    pp = sub.add_parser("set-placeholder-anomaly", help="Set placeholder anomaly percentage (skeleton).")
    pp.add_argument("container_id")
    pp.add_argument("percentage", type=float, help="0..100 (will be quantised to nearest 20).")

    pr = sub.add_parser("print", help="Print a manifest to console and write to a text file.")
    pr.add_argument("container_id")
    pr.add_argument("--out-dir", default="output", help="Output directory for printed manifests.")

    pb = sub.add_parser("print-blank-templates", help="Generate blank manifest templates as text files.")
    pb.add_argument("--out-dir", default="output", help="Output directory for templates.")
    pb.add_argument("--count", type=int, default=20, help="Number of blank templates to generate (default: 20).")

    pl = sub.add_parser("list-containers", help="List container IDs currently in the database.")

    return p


def list_containers(con: sqlite3.Connection) -> List[str]:
    rows = con.execute(
        "SELECT container_id FROM containers ORDER BY created_utc ASC"
    ).fetchall()
    return [r["container_id"] for r in rows]


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.cmd == "init-db":
        init_db(args.db)
        print(f"Database initialised: {args.db}")
        return 0

    if args.cmd == "print-blank-templates":
        paths = generate_blank_templates(args.out_dir, args.count)
        print(f"Generated {len(paths)} blank templates in: {os.path.abspath(args.out_dir)}")
        for pth in paths:
            print(f"- {pth}")
        return 0

    con = connect(args.db)
    try:
        con.executescript("PRAGMA foreign_keys = ON;")

        if args.cmd == "create-container":
            create_container(con, args.container_id)
            print(f"Created container: {args.container_id}")
            return 0

        if args.cmd == "set-header":
            update_header_field(con, args.container_id, args.field, args.value)
            print(f"Updated {args.field} for container: {args.container_id}")
            return 0

        if args.cmd == "add-item":
            add_inventory_item(
                con,
                args.container_id,
                item_name=args.name,
                item_code=args.code,
                quantity=args.qty,
                packaging_packages=args.packages,
                net_mass_kg=args.net_kg,
                gross_mass_kg=args.gross_kg,
            )
            print(f"Added inventory item to container: {args.container_id}")
            return 0

        if args.cmd == "scan":
            record_scan(
                con,
                args.container_id,
                qrCode=args.qrCode,
                is_anomaly=bool(args.anomaly),
                anomaly_type=args.type,
                notes=args.notes,
            )
            print(f"Recorded scan for container: {args.container_id}")
            return 0

        if args.cmd == "set-placeholder-anomaly":
            set_placeholder_anomaly_pct(con, args.container_id, args.percentage)
            q = quantise_to_20_percent(args.percentage)
            print(f"Set placeholder anomaly percentage for {args.container_id} to {q}%")
            return 0

        if args.cmd == "print":
            content, out_path = print_manifest(con, args.container_id, args.out_dir)
            print(content)
            print(f"\nWrote manifest to: {os.path.abspath(out_path)}")
            return 0

        if args.cmd == "list-containers":
            ids = list_containers(con)
            if not ids:
                print("(no containers in database)")
            else:
                print("Containers")
                print("----------")
                for cid in ids:
                    print(f"- {cid}")
            return 0

        raise RuntimeError("Unhandled command.")

    finally:
        con.close()


if __name__ == "__main__":
    raise SystemExit(main())
