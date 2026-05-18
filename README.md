# GONetView

GONetView is the fully web-based translation of GOVis. GOVis remains unchanged as the local Python service; GONetView uses a Python preprocessing step only to compile static Gene Ontology and annotation indexes for the browser.

## Architecture

- `scripts/preprocess_govis_data.py` reads `../GOVis/go-basic.obo` and `../GOVis/annotations/*.gaf.gz`.
- The script writes split static JSON indexes to `frontend/public/data/` and gzip sidecars for efficient hosting.
- The React/TypeScript frontend loads those JSON files directly, caches large chunks in IndexedDB, and performs search, gene lookup, graph extraction, layout, and export in the browser.
- The deployed app has no Python runtime and no API server.

## Build Data

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_govis_data.py
```

Compile only the ontology:

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_govis_data.py --ontology-only
```

Compile selected organisms:

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_govis_data.py --organism goa_human --organism mgi
```

The default output is split by responsibility:

```text
frontend/public/data/go/manifest.json
frontend/public/data/go/terms.json
frontend/public/data/annotations/goa_human/manifest.json
frontend/public/data/annotations/goa_human/genes.json
frontend/public/data/annotations/goa_human/aliases.json
frontend/public/data/annotations/goa_human/gene-to-terms.json
frontend/public/data/annotations/goa_human/term-to-genes.json
```

## Run Frontend

```powershell
npm.cmd --prefix frontend install
npm.cmd --prefix frontend run dev
```

Open `http://127.0.0.1:5173/`.

## Production Build

```powershell
npm.cmd --prefix frontend run build
```

Deploy `frontend/dist/` as a static site.

Preview the built static site locally:

```powershell
node scripts\serve-dist.mjs
```

The preview server serves `.gz` sidecars when the browser supports gzip. Configure nginx or another production server to do the same for the generated `.json.gz` files.
