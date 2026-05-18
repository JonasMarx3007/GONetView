from __future__ import annotations

import argparse
import gzip
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compile GOVis ontology and annotation inputs into static GONetView browser data."
    )
    parser.add_argument(
        "--govis-root",
        default=str(Path(__file__).resolve().parents[2] / "GOVis"),
        help="Path to the existing GOVis project containing go-basic.obo and annotations/.",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parents[1] / "frontend" / "public" / "data"),
        help="Output directory for static JSON files consumed by the browser app.",
    )
    parser.add_argument(
        "--organism",
        action="append",
        help="Organism key to compile. Repeat to compile several. Defaults to all available organisms.",
    )
    parser.add_argument("--ontology-only", action="store_true", help="Compile only the GO ontology index.")
    parser.add_argument("--legacy-bundles", action="store_true", help="Also write old monolithic JSON bundles.")
    args = parser.parse_args()

    govis_root = Path(args.govis_root).resolve()
    output = Path(args.output).resolve()
    sys.path.insert(0, str(govis_root))

    from backend.annotations import gene_json, list_organisms, load_annotations, organism_json
    from backend.go_parser import parse_obo

    obo_path = govis_root / "go-basic.obo"
    annotations_dir = govis_root / "annotations"
    if not obo_path.exists():
        raise SystemExit(f"Missing ontology file: {obo_path}")

    output.mkdir(parents=True, exist_ok=True)
    (output / "go").mkdir(parents=True, exist_ok=True)
    (output / "annotations").mkdir(parents=True, exist_ok=True)

    print(f"Reading ontology: {obo_path}")
    graph = parse_obo(obo_path)
    organisms = list_organisms(annotations_dir)
    available = {organism.key for organism in organisms}
    requested = set(args.organism or [organism.key for organism in organisms])
    missing = sorted(requested - available)
    if missing:
        raise SystemExit(f"Unknown organism key(s): {', '.join(missing)}")
    manifest_organisms = [] if args.ontology_only else [organism for organism in organisms if organism.key in requested]
    organism_payloads = [_web_organism_json(organism_json(organism)) for organism in manifest_organisms]

    generated_at = datetime.now(timezone.utc).isoformat()
    stats_payload = {
        "terms": len(graph.terms),
        "edges": graph.edge_count,
        "namespaces": graph.namespaces,
        "maxAncestorDepth": graph.max_ancestor_depth,
        "maxDescendantDepth": graph.max_descendant_depth,
        "dataVersion": graph.data_version,
        "source": obo_path.name,
    }
    terms_payload = [
        {
            "id": term.id,
            "name": term.name,
            "namespace": term.namespace,
            "definition": term.definition,
            "parents": list(term.parents),
            "relations": [[relation.target, relation.type] for relation in term.relations],
            "obsolete": term.obsolete,
            "level": graph.levels.get(term.id, 0),
        }
        for term in sorted(graph.terms.values(), key=lambda item: item.id)
    ]
    ontology_manifest = {
        "generatedAt": generated_at,
        "stats": stats_payload,
        "organisms": organism_payloads,
        "files": {
            "terms": "go/terms.json",
            "termSearch": "go/term-search.json",
        },
    }
    write_json(output / "go" / "manifest.json", ontology_manifest)
    write_json(output / "go" / "terms.json", terms_payload)
    write_json(output / "go" / "term-search.json", _term_search_rows(terms_payload))
    if args.legacy_bundles:
        write_json(
            output / "go-index.json",
            {
                "generatedAt": generated_at,
                "stats": stats_payload,
                "organisms": organism_payloads,
                "terms": terms_payload,
            },
        )

    if args.ontology_only:
        print("Ontology-only mode: skipped annotations.")
        return

    for organism in organisms:
        if organism.key not in requested:
            continue
        print(f"Reading annotations: {organism.key}")
        annotations = load_annotations(str(annotations_dir), organism.key)
        genes = [
            gene_json(record)
            for record in sorted(
                (
                    _with_term_count(record, len(annotations.gene_to_terms.get(key, ())))
                    for key, record in annotations.genes.items()
                ),
                key=lambda record: (record.symbol.lower(), record.object_id.lower()),
            )
        ]
        payload = {
            "organism": _web_organism_json(organism_json(annotations.organism)),
            "dateGenerated": annotations.date_generated,
            "generatedAt": generated_at,
            "files": {
                "genes": f"annotations/{organism.key}/genes.json",
                "geneSearch": f"annotations/{organism.key}/gene-search.json",
                "termToGenes": f"annotations/{organism.key}/term-to-genes.json",
                "geneToTerms": f"annotations/{organism.key}/gene-to-terms.json",
                "aliases": f"annotations/{organism.key}/aliases.json",
            },
        }
        organism_dir = output / "annotations" / organism.key
        write_json(organism_dir / "manifest.json", payload)
        write_json(organism_dir / "genes.json", genes)
        write_json(organism_dir / "gene-search.json", _gene_search_rows(genes))
        write_json(organism_dir / "term-to-genes.json", {term_id: list(keys) for term_id, keys in sorted(annotations.term_to_genes.items())})
        write_json(organism_dir / "gene-to-terms.json", {key: list(terms) for key, terms in sorted(annotations.gene_to_terms.items())})
        write_json(organism_dir / "aliases.json", {alias: list(keys) for alias, keys in sorted(annotations.aliases.items())})
        if args.legacy_bundles:
            write_json(
                output / "annotations" / f"{organism.key}.json",
                {
                    "organism": payload["organism"],
                    "dateGenerated": annotations.date_generated,
                    "genes": genes,
                    "termToGenes": {term_id: list(keys) for term_id, keys in sorted(annotations.term_to_genes.items())},
                    "geneToTerms": {key: list(terms) for key, terms in sorted(annotations.gene_to_terms.items())},
                    "aliases": {alias: list(keys) for alias, keys in sorted(annotations.aliases.items())},
                },
            )


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with path.open("w", encoding="utf-8") as handle:
        handle.write(encoded.decode("utf-8"))
    with gzip.open(f"{path}.gz", "wb", compresslevel=9) as handle:
        handle.write(encoded)
    print(f"Wrote {path}")


def _web_organism_json(payload: dict[str, object]) -> dict[str, object]:
    key = str(payload["key"])
    return {
        "key": key,
        "label": payload["label"],
        "file": f"data/annotations/{key}/manifest.json",
        "size": payload["size"],
    }


def _with_term_count(record: object, term_count: int) -> object:
    from backend.annotations import GeneRecord

    return GeneRecord(
        key=record.key,
        db=record.db,
        object_id=record.object_id,
        symbol=record.symbol,
        name=record.name,
        taxon=record.taxon,
        term_count=term_count,
    )


def _gene_search_rows(genes: list[dict[str, object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for gene in genes:
        symbol = str(gene.get("symbol", ""))
        object_id = str(gene.get("objectId", ""))
        db = str(gene.get("db", ""))
        name = str(gene.get("name", ""))
        rows.append(
            {
                "key": gene.get("key", ""),
                "db": db,
                "objectId": object_id,
                "symbol": symbol,
                "name": name,
                "taxon": gene.get("taxon", ""),
                "termCount": gene.get("termCount", 0),
                "search": f"{symbol} {object_id} {db}:{object_id} {name}".lower(),
            }
        )
    return rows


def _term_search_rows(terms: list[dict[str, object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for term in terms:
        term_id = str(term.get("id", ""))
        name = str(term.get("name", ""))
        rows.append(
            {
                "id": term_id,
                "name": name,
                "namespace": term.get("namespace", ""),
                "definition": term.get("definition", ""),
                "parentCount": len(term.get("parents", [])),
                "childCount": 0,
                "level": term.get("level", 0),
                "obsolete": term.get("obsolete", False),
                "search": f"{term_id} {term_id.replace(':', '')} {name}".lower(),
            }
        )
    return rows


if __name__ == "__main__":
    main()
