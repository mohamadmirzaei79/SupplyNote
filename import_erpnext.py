"""Normalize a saved bundle of ERPNext Bin, Sales Order and Purchase Order documents."""
import argparse
import json
from datetime import date
from pathlib import Path


def convert(bundle, warehouse, as_of):
    items = {}
    orders = []
    for b in bundle["Bin"]:
        if b["warehouse"] != warehouse:
            continue
        sku = b["item_code"]
        if sku in items:
            raise ValueError("Duplicate bin for " + sku)
        items[sku] = dict(sku=sku, name=b.get("item_name") or sku,
                          family=b.get("item_group") or "Stock", qty=float(b["actual_qty"]), bin=b["name"])
    for doctype, kind, fulfilled, party, schedule in [
        ("Sales Order", "sales", "delivered_qty", "customer", "delivery_date"),
        ("Purchase Order", "purchase", "received_qty", "supplier", "schedule_date")]:
        for doc in bundle[doctype]:
            if doc["docstatus"] != 1 or doc.get("status") in {"Closed", "Completed", "On Hold"}:
                continue
            for line in doc["items"]:
                if line.get("warehouse") != warehouse:
                    continue
                sku = line["item_code"]
                if sku not in items:
                    raise ValueError("Missing stock bin for " + sku)
                remaining = (float(line["qty"]) - float(line[fulfilled])) * float(line["conversion_factor"])
                if remaining <= 0:
                    continue
                due = date.fromisoformat(line.get(schedule) or doc[schedule])
                orders.append(dict(id=doc["name"] + "/" + str(line["idx"]), sku=sku,
                                   day=max(0, (due-as_of).days), qty=round(remaining, 6),
                                   type=kind, party=doc[party]))
    if not items:
        raise ValueError("No bins in selected warehouse")
    return {"asOf": as_of.isoformat(), "warehouse": warehouse, "items": list(items.values()), "orders": orders}


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("bundle", type=Path)
    cli.add_argument("--warehouse", required=True)
    cli.add_argument("--as-of", required=True, type=date.fromisoformat)
    cli.add_argument("--output", required=True, type=Path)
    args = cli.parse_args()
    result = convert(json.loads(args.bundle.read_text()), args.warehouse, args.as_of)
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(result, output, indent=2)
