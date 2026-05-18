# Example Workflow

For a complete walkthrough with screenshots, see `docs/tutorial.md`.

## Quick Version

1. Run `.\run-dev.cmd`.
2. Use **GO terms** mode.
3. Enter:

```text
GO:0050852
GO:0002456
GO:0045065
```

4. Choose `Human (Homo sapiens)`.
5. Set namespace to `biological_process`, ancestor depth to `10`, child depth to `0`, turn on **Trim to selected paths**, and enable `is_a`, `part_of`, `regulates`, `positively_regulates`, and `negatively_regulates`.
6. Click **Map terms**.
7. Search the graph for `activation`.
8. Inspect the details panel and export PNG, SVG, PDF, or JSON.

The expected graph connects T cell receptor signaling pathway, T cell mediated immunity, and cytotoxic T cell differentiation through a trimmed, branched immune-process network.
