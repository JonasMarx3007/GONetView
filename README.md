# GONetView

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20271711.svg)](https://doi.org/10.5281/zenodo.20271711)

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
- Test a gene list for over-represented GO terms, then map the strongest hits as a network.
- Filter relation types and inspect connected term details.
- Export figures as PNG or vector PDF.
- Build a link that reproduces a figure, or that runs an analysis and saves the image for you.
- Regenerate the complete browser dataset from bundled raw inputs.

## Two Ways To Use It

**Map genes or GO terms.** Enter GO IDs or gene symbols to see where they sit in the ontology,
with their ancestors, children, and relation types.

**Test a gene list (ORA).** The Enrichment section has its own gene list, independent of the
graph above it. It runs a one-sided hypergeometric test with Benjamini-Hochberg correction
within each namespace, and the result table can push its strongest terms into the graph. Every
choice that changes the numbers - background universe, term size range, electronic annotations,
redundancy reduction - is a visible control, and each run states the settings it used.

`docs/limitations.md` describes what the test covers and what it does not.

## Links That Reproduce A Figure

The query string carries the whole app state, so a link rebuilds a figure exactly. A link can
also run an analysis on load and save the image by itself:

```text
?org=goa_human&genes=TP53,BRCA1,BRCA2,ATM,CHEK2&curated=1&reduce=1&run=1&top=12&export=png
```

`docs/url-api.md` lists every parameter, and is written so an AI assistant can read it and build
links for you from a gene or GO list.

## Architecture

- `data/raw/go-basic.obo` and `data/raw/annotations/*.gaf.gz` are the raw ontology and annotation inputs.
- `scripts/go_data/` contains the local Python ontology and GAF parsers used by preprocessing.
- `scripts/preprocess_data.py` reads the local raw files and compiles browser data.
- The script writes split static JSON indexes to `frontend/public/data/` and gzip sidecars for efficient hosting.
- The React/TypeScript frontend loads those JSON files directly, caches large chunks in IndexedDB, and performs search, gene lookup, graph extraction, enrichment, layout, and export in the browser.
- Enrichment counting and graph layout run in web workers, so the interface stays responsive while they work.
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

The DOI for GONetView v0.1.0 is `10.5281/zenodo.20271711`.

Citation metadata is also provided in `CITATION.cff`.

## Contributing

See `CONTRIBUTING.md` for setup, testing, issue, and pull request guidance.

## License

GONetView source code is released under the MIT License. See `LICENSE`.
