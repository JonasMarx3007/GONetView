# Changelog

All notable changes to GONetView are tracked here.

## Unreleased

- Added GO over-representation analysis (ORA) with a one-sided hypergeometric test and Benjamini-Hochberg correction applied within each namespace.
- Gave enrichment its own gene list, separate from the graph query, so mapping genes and testing a gene set no longer interfere.
- Added a result table with filtering, sorting, CSV export, and buttons to map the selected or strongest terms into the graph.
- Restricted the enrichment background to annotated gene products by default, with an option to count protein complexes and ncRNA entities.
- Added a tested term size range, defaulting to 5 to 500 background genes per term.
- Added optional exclusion of electronic (IEA) annotations, which required parsing GAF evidence codes and regenerating the browser data.
- Added optional redundancy reduction that hides parent terms already covered by a more significant descendant.
- Added URL parameters for the enrichment request, for running it on load, for mapping its strongest terms, and for saving a figure automatically.
- Moved enrichment counting and readable layout off the main thread, and raised the readable layout limit from 720 to 1,200 nodes using a faster placement profile for large graphs.
- Stopped re-downloading cached data on every visit, and dropped the unused gzip sidecar files from the generated dataset.
- Fixed locale-dependent number formatting that could render 21,050 as 21.050 next to scientific notation.
- Added project metadata, contribution documentation, automated tests, and CI checks.
- Added saved example links for reproducible T-cell and CD8A workflows.
- Added visible app version information and richer JSON metadata export.
- Improved messages for missing GO terms, missing genes, and genes without GO annotations.
- Added real-world workflow documentation with stable query strings.

## 0.1.0 - 2026-05-18

- Initial public standalone release.
- Added local GO OBO and GAF preprocessing code.
- Added static browser data for Gene Ontology terms and supported organism annotations.
- Added browser-based GO term and gene search, graph layout, relation filtering, detail panels, and figure export.
- Added GitHub Pages deployment workflow.
