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

Dense GO neighborhoods can become visually and computationally heavy. Layered layout cost grows far faster than graph size: on real GO graphs the careful profile takes about 6 seconds at 465 nodes and 46 seconds at 901, so graphs above roughly 500 nodes switch to a faster node placement that accepts more edge crossings, and graphs above 1,200 nodes fall back to the classic layout entirely. The bar above the graph says which happened.

A gene list is the usual way to exceed those limits: ten well-studied human genes produce around 900 nodes, because each gene carries dozens of annotations. Narrow the namespace, lower the ancestor or child depth, use fewer genes, or run enrichment and map only its strongest terms.

## What The Enrichment Test Does And Does Not Cover

GONetView runs over-representation analysis (ORA): a one-sided hypergeometric test per GO term, with Benjamini-Hochberg correction applied within each namespace separately, because biological process, molecular function, and cellular component are separate ontologies. Annotations are propagated to `is_a` and `part_of` ancestors unless that is switched off.

Choices that change the numbers are exposed in the sidebar rather than hidden, and every run states its settings above the result table:

- The background is the organism's annotated **gene products**. GAF files also annotate protein complexes and non-coding RNA entities; for human those are 2,274 ComplexPortal and 16,854 RNAcentral objects next to 19,790 UniProtKB genes. Counting them inflates the universe and makes protein-coding results look more significant than they are, so they are excluded unless you ask for them.
- Only terms annotated to 5 to 500 background genes are tested by default. Very small and very large terms carry little information and cost multiple-testing power.
- Electronic annotations (evidence code `IEA`) are included by default and can be dropped. They are machine-inferred and never reviewed by a curator; for human they are about 22 percent of annotation lines.
- Redundancy reduction is optional. It keeps the most significant term of a parent-child chain and hides parents whose contributing genes that term already accounts for. It is a structural filter over the GO hierarchy, not a semantic-similarity method such as REVIGO.

What GONetView still does not do: ranked or score-based enrichment (GSEA-style), gene-set permutation, semantic similarity, protein interaction enrichment, or any test beyond the hypergeometric one described above. Results are a starting point for interpretation, not a substitute for a dedicated statistics package.

## No Backend Search Service

The deployed app has no API server, database, or live backend. This makes hosting easy and reproducible, but it means all search, graph extraction, layout, and export work runs in the browser.

## Annotation Interpretation

Gene-to-term links come from the bundled GAF files and their providers. Absence of a gene or term association in GONetView means it is absent from the bundled snapshot, not necessarily absent from biology.
