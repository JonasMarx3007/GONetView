# Limitations

GONetView is designed as a static, browser-based explorer for Gene Ontology structure and organism annotation snapshots. That design keeps deployment simple, but it also creates clear boundaries.

## Static Data Snapshot

The app uses the generated JSON files under `frontend/public/data/`. It does not query Gene Ontology, UniProt, or model-organism databases live while the user is working. To update the ontology or annotation data, replace files under `data/raw/` and rerun:

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_data.py
```

## Browser Memory

Large organisms and broad graph searches can load sizable static indexes into the browser. The app caches data in IndexedDB where available, but memory use still depends on the user's browser, machine, selected organism, and graph settings.

## Graph Size

Dense GO neighborhoods can become visually and computationally heavy. Keep ancestor and child depth small for readable figures. Use relation filters, namespace filters, graph search, and trim-to-selected paths when graphs become large.

## No Enrichment Statistics

GONetView does not currently calculate GO enrichment, p-values, multiple-testing correction, semantic similarity, or redundancy reduction. It is an exploration and visualization tool, not a statistical enrichment package.

## No Backend Search Service

The deployed app has no API server, database, or live backend. This makes hosting easy and reproducible, but it means all search, graph extraction, layout, and export work runs in the browser.

## Annotation Interpretation

Gene-to-term links come from the bundled GAF files and their providers. Absence of a gene or term association in GONetView means it is absent from the bundled snapshot, not necessarily absent from biology.
