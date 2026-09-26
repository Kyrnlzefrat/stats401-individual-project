#!/usr/bin/env python3
"""Download a reproducible Light-vented Bulbul occurrence dataset from GBIF.

This script intentionally uses a geographic bounding polygon rather than only
GBIF's country filter. The bounding box covers the China-focused map extent,
while the final coordinate filter removes records outside the extent.

Usage:
    python scripts/download_gbif_bulbul.py
    python scripts/download_gbif_bulbul.py --max-records 30000 --min-year 2000 --max-year 2025

Outputs:
    data/bulbul_china.csv
    data/gbif_raw.csv
    data/metadata.json
"""
from __future__ import annotations

import argparse
import csv
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

API = "https://api.gbif.org/v1/occurrence/search"
TAXON_KEY = 2486150
SCIENTIFIC_NAME = "Pycnonotus sinensis"
PAGE_SIZE = 300
HARD_LIMIT = 100_000

LON_MIN, LON_MAX = 73.0, 135.0
LAT_MIN, LAT_MAX = 18.0, 54.5

OUTDIR = Path(__file__).resolve().parents[1] / "data"
CLEAN = OUTDIR / "bulbul_china.csv"
RAW = OUTDIR / "gbif_raw.csv"
META = OUTDIR / "metadata.json"


def args():
    p = argparse.ArgumentParser()
    p.add_argument("--max-records", type=int, default=30000)
    p.add_argument("--min-year", type=int, default=2000)
    p.add_argument("--max-year", type=int, default=2025)
    p.add_argument("--sleep", type=float, default=0.15)
    return p.parse_args()


def page(session, offset, limit, geometry):
    params = {
        "taxonKey": TAXON_KEY,
        "geometry": geometry,
        "hasCoordinate": "true",
        "hasGeospatialIssue": "false",
        "limit": limit,
        "offset": offset,
    }
    for attempt in range(4):
        try:
            r = session.get(API, params=params, timeout=60)
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("GBIF request failed after retries")


def year_of(r):
    value = r.get("year")
    try:
        y = int(value)
        if 1900 <= y <= 2035:
            return y
    except Exception:
        pass
    text = str(r.get("eventDate") or "")
    if len(text) >= 4 and text[:4].isdigit():
        y = int(text[:4])
        if 1900 <= y <= 2035:
            return y
    return None


def clean(raw, min_year, max_year):
    out, seen = [], set()
    dropped = {"duplicate": 0, "coordinate": 0, "year": 0, "year_range": 0}
    for r in raw:
        rid = str(r.get("key") or "")
        if rid and rid in seen:
            dropped["duplicate"] += 1
            continue
        if rid:
            seen.add(rid)
        try:
            lat = float(r.get("decimalLatitude"))
            lon = float(r.get("decimalLongitude"))
        except Exception:
            dropped["coordinate"] += 1
            continue
        if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
            dropped["coordinate"] += 1
            continue
        year = year_of(r)
        if year is None:
            dropped["year"] += 1
            continue
        if not (min_year <= year <= max_year):
            dropped["year_range"] += 1
            continue
        out.append({
            "gbifID": rid,
            "scientificName": r.get("scientificName") or SCIENTIFIC_NAME,
            "eventDate": r.get("eventDate") or "",
            "year": year,
            "decimalLatitude": lat,
            "decimalLongitude": lon,
            "stateProvince": r.get("stateProvince") or "",
            "basisOfRecord": r.get("basisOfRecord") or "",
            "datasetName": r.get("datasetName") or "",
        })
    out.sort(key=lambda x: (x["year"], x["stateProvince"], x["decimalLatitude"], x["decimalLongitude"], x["gbifID"]))
    return out, dropped


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def main():
    a = args()
    if a.min_year > a.max_year:
        raise SystemExit("--min-year cannot exceed --max-year")
    if a.max_records < 1 or a.max_records > HARD_LIMIT:
        raise SystemExit(f"--max-records must be between 1 and {HARD_LIMIT}")

    geometry = (
        f"POLYGON (({LON_MIN} {LAT_MIN}, {LON_MAX} {LAT_MIN}, "
        f"{LON_MAX} {LAT_MAX}, {LON_MIN} {LAT_MAX}, {LON_MIN} {LAT_MIN}))"
    )

    print(f"Querying GBIF for {SCIENTIFIC_NAME} (taxonKey={TAXON_KEY})")
    print(f"Geographic extent: {LON_MIN},{LAT_MIN} to {LON_MAX},{LAT_MAX}")

    raw = []
    with requests.Session() as s:
        first = page(s, 0, PAGE_SIZE, geometry)
        total = int(first.get("count") or 0)
        raw.extend(first.get("results") or [])
        target = min(total, a.max_records)
        print(f"GBIF matches: {total:,}; retrieving up to {target:,}")

        offset = PAGE_SIZE
        while len(raw) < target and offset < total:
            batch = page(s, offset, min(PAGE_SIZE, target - len(raw)), geometry)
            results = batch.get("results") or []
            if not results:
                break
            raw.extend(results)
            print(f"Retrieved {min(len(raw), target):,}/{target:,}", end="\r")
            offset += PAGE_SIZE
            if a.sleep:
                time.sleep(a.sleep)

    rows, dropped = clean(raw, a.min_year, a.max_year)
    fields = [
        "gbifID", "scientificName", "eventDate", "year",
        "decimalLatitude", "decimalLongitude", "stateProvince",
        "basisOfRecord", "datasetName"
    ]
    write_csv(CLEAN, rows, fields)
    write_csv(RAW, raw, [
        "key", "scientificName", "eventDate", "year",
        "decimalLatitude", "decimalLongitude", "stateProvince",
        "basisOfRecord", "datasetName"
    ])

    meta = {
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": "GBIF Occurrence Search API",
        "api": API,
        "taxonKey": TAXON_KEY,
        "scientificName": SCIENTIFIC_NAME,
        "geometry": geometry,
        "year_range": [a.min_year, a.max_year],
        "gbif_matching_records": total,
        "raw_records_retrieved": len(raw),
        "clean_records": len(rows),
        "dropped": dropped,
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    provinces = sorted({r["stateProvince"] for r in rows if r["stateProvince"]})
    print(f"\nClean records: {len(rows):,}")
    print(f"Province labels present in source: {len(provinces)}")
    print("Wrote:")
    print(f"  {CLEAN}")
    print(f"  {RAW}")
    print(f"  {META}")


if __name__ == "__main__":
    main()
