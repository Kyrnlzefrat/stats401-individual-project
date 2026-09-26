# Light-vented Bulbul in China — Visualization Critique & Redesign

This version intentionally changes the visual idiom of the original Oiseaux.net map.

## Redesign

Original:
- Global hexagonal aggregation
- Occurrence count encoded with color classes

Redesign:
- Province-level choropleth for spatial comparison
- Annual line chart for temporal comparison
- Clicking a province links the map and line chart
- Selected year controls the choropleth
- Exact record counts appear in tooltips

## Data

The D3 page reads:

```text
data/bulbul_china.csv
```

If the local project data are missing or appear geographically incomplete, regenerate the dataset directly from GBIF:

```bash
pip install requests
python scripts/download_gbif_bulbul.py --max-records 30000 --min-year 2000 --max-year 2025
```

The download script uses a China-focused geographic bounding polygon rather than relying only on the GBIF country field, then applies coordinate and year filters. It writes both a cleaned CSV and a raw API snapshot.

The included preprocessing script can read CSV/TSV files from the `Final Group Project/data` directory.

Example:

```bash
python scripts/prepare_bulbul_data.py --input-dir "../Final Group Project/data"
```

It normalizes year, latitude, longitude, province, and species fields; removes invalid coordinates and years; restricts records to the China map extent; filters to Light-vented Bulbul when a species field exists; and deduplicates records by ID.

## Run locally

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Do not use `file://` directly because the page loads local CSV and external GeoJSON with `fetch`.

## Original screenshot

Save the Oiseaux.net screenshot as:

```text
assets/original-oiseaux.png
```

## Sources

- Oiseaux.net — Light-vented Bulbul geographic range: https://www.oiseaux.net/en/maps/light-vented.bulbul.html
- GBIF — Pycnonotus sinensis: https://www.gbif.org/species/2486150
- D3.js: https://d3js.org/
- China administrative boundaries (`provinces.json`) from cn-atlas: https://github.com/BarbarossaWang/cn-atlas

GBIF Occurrence API documentation: https://techdocs.gbif.org/en/openapi/v1/occurrence
