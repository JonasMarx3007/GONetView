# Real-World Workflows

These workflows use the bundled GO release and human annotation snapshot. They are meant to be reproducible examples, not benchmark datasets.

## Workflow 1: T-Cell Process Map

Use this when you want a compact figure showing how related immune-process terms connect without collapsing into a single linear chain.

Enter these GO terms:

```text
GO:0050852
GO:0002456
GO:0045065
```

Use:

- Organism: `Human (Homo sapiens)`
- Namespace: `biological_process`
- Ancestor depth: `10`
- Child depth: `0`
- Trim to selected paths: on
- Relations: `is_a`, `part_of`, `regulates`, `positively_regulates`, `negatively_regulates`
- Layout: `Readable`
- Fit: `Fit height`
- Graph search: `activation`

Expected use: identify where T cell receptor signaling pathway, T cell mediated immunity, and cytotoxic T cell differentiation meet through broader immune-system and activation terms. This is a good figure-export example because the selected terms connect through several shared parents rather than one straight path.

Stable query. Append this to the hosted or local GONetView URL:

```text
?mode=go&q=GO%3A0050852%0AGO%3A0002456%0AGO%3A0045065&org=goa_human&ns=biological_process&anc=10&desc=0&rel=is_a%2Cpart_of%2Cregulates%2Cpositively_regulates%2Cnegatively_regulates&layout=readable&trim=1&legend=1&fit=height&find=activation
```

## Workflow 2: CD8A Annotation Context

Use this when you want to start from a gene symbol instead of manually choosing GO terms.

Enter this gene:

```text
CD8A
```

Use:

- Organism: `Human (Homo sapiens)`
- Namespace: `biological_process`
- Ancestor depth: `10`
- Child depth: `0`
- Trim to selected paths: on
- Relations: `is_a`, `part_of`, `regulates`, `positively_regulates`, `negatively_regulates`
- Layout: `Readable`
- Fit: `Fit height`

Expected use: inspect the GO biological-process terms annotated to human CD8A and see how those annotations connect through shared parent paths. This is useful for checking whether a gene list points into a coherent process neighborhood before exporting a figure.

Stable query. Append this to the hosted or local GONetView URL:

```text
?mode=gene&q=CD8A&org=goa_human&ns=biological_process&anc=10&desc=0&rel=is_a%2Cpart_of%2Cregulates%2Cpositively_regulates%2Cnegatively_regulates&layout=readable&trim=1&legend=1&fit=height
```
