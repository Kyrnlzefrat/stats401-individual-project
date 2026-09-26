#!/usr/bin/env python3
"""Normalize an existing Light-vented Bulbul dataset for the D3 page.

Default input search order:
  1. Final Group Project/data
  2. ../Final Group Project/data
  3. data

The script looks for CSV/TSV files containing coordinates and a year/date.
It recognizes common column aliases and, when species columns exist, keeps
records matching Pycnonotus sinensis / Light-vented Bulbul.

Example:
  python scripts/prepare_bulbul_data.py --input-dir "../Final Group Project/data"
"""
from __future__ import annotations
import argparse
import csv
import re
from pathlib import Path

TARGET = "pycnonotus sinensis"
TARGET_COMMON = "light-vented bulbul"

ALIASES = {
    "id": ["gbifid", "gbifID", "id", "key", "occurrenceid"],
    "species": ["scientificname", "scientificName", "species", "taxon", "commonname", "commonName"],
    "date": ["eventdate", "eventDate", "date", "observationdate", "observation_date"],
    "year": ["year", "observationyear", "observation_year"],
    "lat": ["decimallatitude", "decimalLatitude", "latitude", "lat", "y"],
    "lon": ["decimallongitude", "decimalLongitude", "longitude", "lon", "lng", "x"],
    "province": ["stateprovince", "stateProvince", "province", "state", "region", "adm1", "province_name"],
}

def norm_key(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

def find_col(headers, names):
    mapped = {norm_key(h): h for h in headers}
    for n in names:
        if norm_key(n) in mapped:
            return mapped[norm_key(n)]
    return None

def parse_year(row, year_col, date_col):
    if year_col:
        try:
            y = int(float(str(row.get(year_col, "")).strip()))
            if 1900 <= y <= 2035:
                return y
        except Exception:
            pass
    if date_col:
        m = re.search(r"(19|20)\d{2}", str(row.get(date_col, "")))
        if m:
            y = int(m.group(0))
            if 1900 <= y <= 2035:
                return y
    return None

def as_float(value):
    try:
        return float(str(value).strip())
    except Exception:
        return None

def species_matches(value):
    text = str(value or "").lower()
    return TARGET in text or TARGET_COMMON in text or "pycnonotus sinensis" in text

def discover_files(input_dir: Path):
    return sorted([p for p in input_dir.rglob("*") if p.suffix.lower() in {".csv", ".tsv"}])

def read_table(path):
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        return reader.fieldnames or [], list(reader)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=Path("data/bulbul_china.csv"))
    args = parser.parse_args()

    candidates = []
    if args.input_dir:
        candidates = [args.input_dir]
    else:
        here = Path.cwd()
        for p in [here / "Final Group Project" / "data", here.parent / "Final Group Project" / "data", here / "data"]:
            if p.exists():
                candidates.append(p)
    candidates = list(dict.fromkeys(candidates))
    if not candidates:
        raise SystemExit("No input data directory found. Use --input-dir PATH_TO_FINAL_GROUP_PROJECT/data")

    rows_out = []
    used_files = []
    for folder in candidates:
        for path in discover_files(folder):
            headers, rows = read_table(path)
            if not headers:
                continue
            lat_col = find_col(headers, ALIASES["lat"])
            lon_col = find_col(headers, ALIASES["lon"])
            year_col = find_col(headers, ALIASES["year"])
            date_col = find_col(headers, ALIASES["date"])
            species_col = find_col(headers, ALIASES["species"])
            province_col = find_col(headers, ALIASES["province"])
            id_col = find_col(headers, ALIASES["id"])
            if not lat_col or not lon_col or not (year_col or date_col):
                continue

            kept = 0
            for i, row in enumerate(rows):
                if species_col and not species_matches(row.get(species_col)):
                    continue
                lat = as_float(row.get(lat_col))
                lon = as_float(row.get(lon_col))
                year = parse_year(row, year_col, date_col)
                if lat is None or lon is None or year is None:
                    continue
                if not (18 <= lat <= 54.5 and 73 <= lon <= 135):
                    continue
                rows_out.append({
                    "gbifID": row.get(id_col, f"{path.stem}_{i}"),
                    "scientificName": row.get(species_col, "Pycnonotus sinensis") if species_col else "Pycnonotus sinensis",
                    "eventDate": row.get(date_col, "") if date_col else "",
                    "year": year,
                    "decimalLatitude": lat,
                    "decimalLongitude": lon,
                    "stateProvince": row.get(province_col, "") if province_col else "",
                })
                kept += 1
            if kept:
                used_files.append((str(path), kept))

    if not rows_out:
        raise SystemExit("No usable Light-vented Bulbul records were found. Check the input directory and column names.")

    # Deduplicate by GBIF ID when possible.
    seen = set()
    unique = []
    for r in rows_out:
        key = r["gbifID"]
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)

    unique.sort(key=lambda r: (r["year"], str(r["stateProvince"]), r["decimalLatitude"], r["decimalLongitude"], str(r["gbifID"])))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["gbifID","scientificName","eventDate","year","decimalLatitude","decimalLongitude","stateProvince"]
    with args.output.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(unique)

    print(f"Wrote {len(unique):,} cleaned records to {args.output}")
    print("Files used:")
    for path, n in used_files:
        print(f"  {path}: {n:,} records")

if __name__ == "__main__":
    main()
