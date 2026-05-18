# GONetView

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20271710.svg)](https://doi.org/10.5281/zenodo.20271710)

GONetView is a standalone, fully web-based Gene Ontology network viewer. It uses a Python preprocessing step to compile raw Gene Ontology and GAF annotation files into static browser indexes, then the React/TypeScript app runs entirely in the browser.

![GONetView overview](docs/assets/gonetview-overview.png)

## Open The App

Use the hosted version:

```text
https://jonasmarx3007.github.io/GONetView/
```

Or run it locally with `.\run-dev.cmd`.

## Why Use It

- Explore GO term neighborhoods without running a backend service.
- Search GO terms and organism-specific genes from static browser indexes.
- Filter relation types and inspect connected term details.
- Export figures as PNG or vector PDF.
- Regenerate the complete browser dataset from bundled raw inputs.

## Architecture

- `data/raw/go-basic.obo` and `data/raw/annotations/*.gaf.gz` are the raw ontology and annotation inputs.
- `scripts/go_data/` contains the local Python ontology and GAF parsers used by preprocessing.
- `scripts/preprocess_data.py` reads the local raw files and compiles browser data.
- The script writes split static JSON indexes to `frontend/public/data/` and gzip sidecars for efficient hosting.
- The React/TypeScript frontend loads those JSON files directly, caches large chunks in IndexedDB, and performs search, gene lookup, graph extraction, layout, and export in the browser.
- The deployed app has no Python runtime and no API server.

More detail is available in `docs/architecture.md`.

## Build Data

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_data.py
```

The default raw input folder is:

```text
data/raw/
```

Use another raw data folder:

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_data.py --raw-data-root C:\path\to\raw-data
```

Compile only the ontology:

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_data.py --ontology-only
```

Compile selected organisms:

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_data.py --organism goa_human --organism mgi
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

For the built preview, use:

```powershell
.\run-dev.cmd
```

It starts on `http://127.0.0.1:5174/` and automatically tries the next port if that one is busy.

## Production Build

```powershell
npm.cmd --prefix frontend run build
```

Deploy `frontend/dist/` as a static site.

Preview the built static site locally:

```powershell
.\run-dev.cmd
```

The preview server serves `.gz` sidecars when the browser supports gzip. Configure nginx or another production server to do the same for the generated `.json.gz` files.

## Tests

Run Python parser tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

Run frontend unit tests:

```powershell
npm.cmd --prefix frontend test
```

Run the browser smoke test:

```powershell
npm.cmd --prefix frontend exec playwright install chromium
npm.cmd --prefix frontend run test:browser
```

Run the production build:

```powershell
npm.cmd --prefix frontend run build
```

## Preprocessing Code

`scripts/go_data/` contains the local parser code used to regenerate browser data from `data/raw/`.

## Documentation

- `docs/architecture.md` describes the code and data flow.
- `docs/tutorial.md` walks through a reproducible human T-cell network example.
- `docs/example-workflow.md` gives a short reproducible user workflow.
- `docs/workflows.md` lists real-world workflow examples with stable query strings.
- `docs/limitations.md` explains current boundaries and tradeoffs.
- `data/raw/README.md` documents bundled raw data sources.

## Citation

If you use GONetView in research, please cite the archived software release:

```text
Marx, J. (2026). GONetView (v0.1.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.20271711
```

The version DOI for GONetView v0.1.0 is `10.5281/zenodo.20271711`. The all-versions DOI is `10.5281/zenodo.20271710`.

Citation metadata is also provided in `CITATION.cff`.

## Contributing

See `CONTRIBUTING.md` for setup, testing, issue, and pull request guidance.

## License

GONetView source code is released under the MIT License. See `LICENSE`.
