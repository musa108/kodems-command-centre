# Geography & map data

## What is and is not included
- **Included:** the 21 Kogi LGA *names* (verified against the INEC PU directory and several public lists). Internal codes `KG01…KG21` are **not official codes**.
- **Not included (deliberately):** boundaries, wards, communities, coordinates of LGAs, official contacts, flood-risk layers, shelter lists. The map shows boundaries **only** from the `geographic_boundaries` table; it is empty until you import verified data, and the UI says so. Demo incidents use rough placeholder coordinates labelled DEMO.
- Base tiles default to OpenStreetMap raster tiles for development. OSM's tile policy forbids heavy production use — choose a licensed provider (Mapbox, MapTiler, self-hosted OSM tiles, government basemap) and set `NEXT_PUBLIC_MAP_TILES` / attribution.

## Importing official boundaries
1. Obtain a verified dataset (e.g. from the Office of the Surveyor-General, NBS or GRID3 — confirm licence and currency).
2. `npm -w apps/api run boundaries:import -- --file kogi-lga.geojson --kind LGA --name-property NAME --source "GRID3 Nigeria LGA boundaries v2023, CC-BY 4.0"`
3. Features whose name does not match an existing LGA are **rejected, not created**. Re-running with the same `--source` replaces that import. Use `--placeholder` to flag a non-authoritative file.
4. Wards/overlays: `--kind WARD|OVERLAY` store geometry without LGA matching (extend the importer when official ward data exists).

## Spatial design
Points: `geom geography(Point,4326)` generated from lat/lng (single source of truth) with GiST indexes. Polygons: `geometry(MultiPolygon,4326)`. Duplicate detection uses `ST_DWithin` (2 km). Distances use geography (metres); use an appropriate projected CRS (e.g. UTM 32N/31N) for area calculations when you add them.
