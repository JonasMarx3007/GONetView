# Link API

Everything GONetView shows is described by the query string. A link therefore reproduces a
figure exactly, and can be built by hand, by a script, or by an AI assistant that has read this
page.

The app runs entirely in your browser. There is no server that returns images, so a link does
not send a file back on its own: opening the link runs the analysis on your machine, and with
`export=png` the finished figure is saved to your downloads folder automatically.

## Asking An Assistant For A Link

Paste this page (or its URL) into any AI assistant together with your gene or GO list, and say
which of the three analyses you want. A useful prompt looks like:

```text
Using the GONetView link API documented at
https://jonasmarx3007.github.io/GONetView/docs/url-api.md
build me a link for an ORA of these human genes that saves a PNG of the top 15 terms:
TP53, BRCA1, BRCA2, ATM, CHEK2, RAD51, MDM2, CDKN1A, BAX, PARP1
```

The assistant replies with a link. Opening it runs the analysis and downloads the figure.

## Base

```text
https://jonasmarx3007.github.io/GONetView/?<parameters>
```

Lists are separated by commas, spaces, or newlines. When encoding a URL, a newline is `%0A` and
a space is `%20`; commas need no encoding. Parameters may appear in any order, and anything you
leave out keeps its default.

## Which Analysis Do You Want?

| Your input | Your question | Use | Required parameters |
| --- | --- | --- | --- |
| GO IDs or term names | Where do these terms sit in the ontology, and how do they connect? | **Pipeline 1: GO term map** | `mode=go` and `q` |
| Gene symbols or IDs | Which GO terms is this gene annotated to? | **Pipeline 2: gene map** | `mode=gene` and `q` |
| A gene list (10 to a few thousand) | Which GO terms are over-represented in this list? | **Pipeline 3: ORA** | `genes` and `run=1` |

Pipelines 1 and 2 draw the graph and share every graph parameter. Pipeline 3 is independent: it
has its own gene list (`genes`, not `q`) and writes its results into the table under the graph.
A single link may carry both a graph and an ORA run.

## Pipeline 1: Map GO Terms

Draws the neighbourhood of the GO terms you name.

```text
?mode=go&q=GO:0050852,GO:0002456&anc=3&desc=0&layout=readable
```

`q` accepts GO IDs (`GO:0050852`) or exact term names (`T cell receptor signaling pathway`).
Terms that cannot be resolved are reported in the bar above the graph.

## Pipeline 2: Map Genes

Resolves gene symbols or database IDs to the GO terms they are annotated to, then draws that
neighbourhood.

```text
?mode=gene&q=CD8A&org=goa_human&ns=biological_process&anc=3&trim=1&layout=readable
```

`q` accepts symbols (`CD8A`), database IDs (`UniProtKB:P01732`), and synonyms from the
annotation file. Be aware of size: one gene is comfortable, but ten well-studied human genes
produce roughly 900 nodes because each carries dozens of annotations. Narrow with `ns`, lower
`anc`, or use pipeline 3 and map only its strongest terms.

### Graph Parameters (Pipelines 1 And 2)

| Parameter | Meaning | Default |
| --- | --- | --- |
| `mode` | `go` for GO terms, `gene` for genes | `go` |
| `q` | the GO IDs, term names, gene symbols, or gene IDs to map | `GO:0019319` |
| `org` | organism key: `goa_human`, `mgi`, `rgd`, `zfin`, `fb`, `wb`, `sgd`, `pombase`, `tair`, `dictybase`, `ecocyc`, `goa_chicken`, `goa_cow`, `goa_dog`, `goa_pig`, `xenbase` | `goa_human` |
| `ns` | restrict to one namespace: `biological_process`, `molecular_function`, `cellular_component` | all |
| `anc` | how many ancestor levels to include | `1` |
| `desc` | how many child levels to include | `0` |
| `rel` | relation types to follow and draw, comma separated: `is_a`, `part_of`, `regulates`, `positively_regulates`, `negatively_regulates` | `is_a` |
| `random` + `child` | sample at most `child` children per term instead of all | off |
| `obsolete` | `1` includes obsolete terms | `0` |
| `trim` | `1` shows only the paths connecting your selected terms | `0` |
| `layout` | `readable` (layered, slower) or `classic` (fast) | `readable` |
| `fit` | `height` or `width` | `height` |
| `legend` | `0` hides the legend | `1` |
| `find` | highlight nodes matching this text | none |

## Pipeline 3: Over-Representation Analysis

Tests a gene list for over-represented GO terms with a one-sided hypergeometric test, corrected
by Benjamini-Hochberg within each namespace.

```text
?org=goa_human&genes=TP53,BRCA1,BRCA2,ATM,CHEK2,RAD51,MDM2,CDKN1A,BAX,PARP1&run=1
```

Without `run=1` the settings are filled in but nothing is calculated until you press
**Run enrichment**.

### ORA Parameters

| Parameter | Meaning | Default |
| --- | --- | --- |
| `genes` | the gene list to test; this is separate from `q` | required |
| `bg` | custom background list, taken exactly as given | all annotated gene products of `org` |
| `run` | `1` runs the analysis on load | `0` |
| `curated` | `1` drops electronic (IEA) annotations, keeping curator-reviewed evidence | `0` |
| `reduce` | `1` hides parent terms whose hits a stronger descendant already covers | `0` |
| `propagate` | `1` counts a gene for a term's `is_a` and `part_of` ancestors, `0` tests direct annotations only | `1` |
| `minsize` | smallest term to test, counted in background genes | `5` |
| `maxsize` | largest term to test; `0` removes the cap | `500` |
| `ns` | restrict the tested terms to one namespace | all |
| `obsolete` | `1` also tests obsolete terms | `0` |
| `top` | after the run, draw this many strongest terms as a graph | none |

`org`, `ns`, and `obsolete` are shared with the graph pipelines.

### What The Options Do To The Numbers

Measured on the ten-gene human DNA damage list above:

| Settings | Significant terms at FDR ≤ 0.05 |
| --- | --- |
| defaults | 163 |
| `curated=1` | 144 |
| `curated=1&reduce=1` | 83 |

`curated=1` also shrinks the background from 19,790 to 19,195 genes, because 595 genes keep no
annotation once electronic ones are dropped.

## Saving Results Automatically

`export` takes one value or several separated by commas, and each one is saved once the analysis
it needs has finished.

| Value | What you get | Needs |
| --- | --- | --- |
| `png` | the figure as a raster image | a graph |
| `svg` | the figure as vector graphics | a graph |
| `pdf` | the figure as a vector PDF | a graph |
| `csv` | the full enrichment table, one row per tested term | `genes` and `run=1` |
| `json` | every setting, the graph summary, and the enrichment results as metadata | nothing |

The downloads start on their own, so the browser may ask you to allow them, and Chrome asks once
before saving several files from one page. Large graphs take longer because the layout runs
first. Combine `export` with `top` to get a figure of the enrichment result rather than of the
graph query.

The CSV columns are `go_id`, `term_name`, `namespace`, `query_hits`, `query_size`,
`background_hits`, `background_size`, `expected_hits`, `fold_enrichment`, `p_value`,
`adjusted_p_value`, and `genes` (semicolon separated). It contains every tested term, not only
the significant ones, so you can apply your own threshold. Rows are ordered as in the app: by
adjusted p value, then p value, then fold enrichment.

### The Same Analysis, Three Outputs

These three links describe one identical ORA. Only the last parameter differs, so you can pick
the output without rethinking the query.

**Shared part** — the analysis itself:

```text
?org=goa_human&genes=TP53,BRCA1,BRCA2,ATM,CHEK2,RAD51,MDM2,CDKN1A,BAX,PARP1&curated=1&reduce=1&run=1&top=12
```

**Table only.** No figure is drawn, so this returns fastest; `top` may be left out entirely.

```text
?org=goa_human&genes=TP53,BRCA1,BRCA2,ATM,CHEK2,RAD51,MDM2,CDKN1A,BAX,PARP1&curated=1&reduce=1&run=1&export=csv
```

**Image only.** `top=12` decides how many of the strongest terms are drawn.

```text
?org=goa_human&genes=TP53,BRCA1,BRCA2,ATM,CHEK2,RAD51,MDM2,CDKN1A,BAX,PARP1&curated=1&reduce=1&run=1&top=12&export=png
```

**Both, plus the metadata that documents them.**

```text
?org=goa_human&genes=TP53,BRCA1,BRCA2,ATM,CHEK2,RAD51,MDM2,CDKN1A,BAX,PARP1&curated=1&reduce=1&run=1&top=12&export=png,csv,json
```

The rule is simply that `export` is a list: `export=csv` for the table, `export=png` for the
figure, `export=png,csv` for both, and add `json` whenever you want the settings recorded
alongside them. Any figure format can replace `png`, so `export=pdf,csv` gives a vector figure
with the table.

## Worked Examples

```text
Ancestors of two T-cell terms, trimmed to their shared paths:
?mode=go&q=GO:0050852,GO:0002456&ns=biological_process&anc=10&trim=1&rel=is_a,part_of

Everything CD8A is annotated to, as a readable figure saved to disk:
?mode=gene&q=CD8A&org=goa_human&ns=biological_process&anc=3&trim=1&export=png

Mouse gene set, curated evidence only, no redundant parents:
?org=mgi&genes=Trp53,Brca1,Atm,Chek2,Rad51&curated=1&reduce=1&run=1

Broad ORA with no term size limits, direct annotations only:
?org=goa_human&genes=HK1,GPI,PFKM,ALDOA,GAPDH,PGK1,ENO1,PKM&propagate=0&minsize=1&maxsize=0&run=1

Just the enrichment table for a mouse gene set, no figure:
?org=mgi&genes=Trp53,Brca1,Atm,Chek2,Rad51&curated=1&run=1&export=csv

A vector figure and the table together:
?org=goa_human&genes=TP53,BRCA1,ATM,CHEK2,RAD51&run=1&top=10&export=pdf,csv
```

## Reading The Result

The bar above the graph states what is on screen, for example *Showing top 12 enriched terms by
FDR*. Hovering the results panel shows the full method summary: the test, the correction, the
term size range, the evidence used, the background, and any redundancy reduction. The JSON
export in the sidebar writes those same settings to a file, which is the reliable way to record
how a figure was produced.
