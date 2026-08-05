# GONetView Architecture

This document gives the short technical map of GONetView for users and contributors.

## What GONetView Is

GONetView is a static web application for exploring Gene Ontology (GO) structure and organism-specific gene annotations. It has two stages:

1. A Python preprocessing stage converts raw GO and GAF files into compact JSON indexes.
2. A React/TypeScript frontend loads those indexes directly in the browser.

The deployed application has no backend API and no Python runtime.

## Main Directories

| Path | Purpose |
| --- | --- |
| `data/raw/` | Bundled raw GO ontology and GAF annotation inputs. |
| `scripts/go_data/` | Local Python parsers for OBO and GAF files. |
| `scripts/preprocess_data.py` | Builds static JSON and gzip sidecars from `data/raw/`. |
| `frontend/src/` | React/TypeScript application source. |
| `frontend/public/data/` | Generated browser data consumed by the app. |
| `tests/` | Python tests for ontology and annotation parsing. |
| `frontend/test/` | Frontend unit tests using the Node test runner. |
| `.github/workflows/` | CI, build, and deployment workflows. |

## Data Flow

```text
data/raw/go-basic.obo
data/raw/annotations/*.gaf.gz
        |
        v
scripts/preprocess_data.py
        |
        v
frontend/public/data/**/*.json
frontend/public/data/**/*.json.gz
        |
        v
React/TypeScript browser app
```

## Preprocessing

`scripts/preprocess_data.py` reads:

- `data/raw/go-basic.obo`
- `data/raw/annotations/*.gaf.gz`

It writes:

- GO term records
- GO term search rows
- organism manifests
- gene records
- gene search rows
- gene-to-term indexes
- term-to-gene indexes
- alias indexes

Every JSON output is also written as a `.json.gz` sidecar for efficient static hosting.

## Frontend Runtime

The frontend:

- loads generated JSON files from `frontend/public/data/`
- caches larger data files in IndexedDB
- parses GO term and gene inputs locally
- extracts graph neighborhoods in the browser
- computes graph layout with ELK
- renders the network as SVG
- exports figures as PNG or vector PDF

## Workers

Two pieces of work are heavy enough to freeze a tab, so both run off the main thread:

- Enrichment counting walks every background gene and its propagated ancestors. The main thread
  sends a compact index once per dataset, and the worker keeps it primed for later runs.
- Readable layout uses elkjs, which is run through its own worker build. Layout cost grows much
  faster than graph size, so graphs past roughly 500 nodes use a faster placement profile.

Both have a main-thread fallback, which is also the path the node tests exercise.

## Core Languages

| Language | Use |
| --- | --- |
| TypeScript | Browser application, graph/search UI, export logic. |
| React | UI composition and state management. |
| CSS | Responsive app styling. |
| Python | GO and GAF preprocessing. |
| JavaScript | Static preview server and frontend tests. |

## Evidence Codes

Preprocessing writes two gene-to-term indexes per organism: the full one, and a second built
without electronic (`IEA`) annotations. The enrichment option to use curated evidence only picks
the second index, which keeps the common path unchanged and avoids storing an evidence code on
every gene-term pair.

## Local Reproducibility

Build all browser data:

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_data.py
```

Build the frontend:

```powershell
npm.cmd --prefix frontend run build
```

Run tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run test:browser
```
