from __future__ import annotations

import gzip
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


# GAF column 7 evidence code for annotations inferred by machine, without curator review.
ELECTRONIC_EVIDENCE = "IEA"

ORGANISM_LABELS = {
    "dictybase": "Dictyostelium discoideum",
    "ecocyc": "Escherichia coli",
    "fb": "Drosophila melanogaster",
    "goa_chicken": "Chicken (Gallus gallus)",
    "goa_cow": "Cow (Bos taurus)",
    "goa_dog": "Dog (Canis lupus familiaris)",
    "goa_human": "Human (Homo sapiens)",
    "goa_pig": "Pig (Sus scrofa)",
    "mgi": "Mouse (Mus musculus)",
    "pombase": "Fission yeast (S. pombe)",
    "rgd": "Rat (Rattus norvegicus)",
    "sgd": "Budding yeast (S. cerevisiae)",
    "tair": "Arabidopsis thaliana",
    "wb": "Worm (C. elegans)",
    "xenbase": "Xenopus",
    "zfin": "Zebrafish (Danio rerio)",
}


@dataclass(frozen=True)
class OrganismFile:
    key: str
    label: str
    file: str
    size: int


@dataclass(frozen=True)
class GeneRecord:
    key: str
    db: str
    object_id: str
    symbol: str
    name: str
    taxon: str
    term_count: int = 0


class AnnotationIndex:
    def __init__(
        self,
        organism: OrganismFile,
        genes: dict[str, GeneRecord],
        term_to_gene_keys: dict[str, set[str]],
        gene_to_terms: dict[str, set[str]],
        aliases: dict[str, set[str]],
        date_generated: str | None,
        gene_to_terms_experimental: dict[str, set[str]] | None = None,
    ) -> None:
        self.organism = organism
        self.genes = genes
        self.term_to_genes = {
            term_id: tuple(sorted(keys, key=lambda key: genes[key].symbol.lower()))
            for term_id, keys in term_to_gene_keys.items()
        }
        self.gene_to_terms = {
            gene_key: tuple(sorted(terms))
            for gene_key, terms in gene_to_terms.items()
        }
        # Same mapping with electronic (IEA) annotations left out, so enrichment can be run
        # on curated evidence only without a second pass over the GAF.
        self.gene_to_terms_experimental = {
            gene_key: tuple(sorted(terms))
            for gene_key, terms in (gene_to_terms_experimental or {}).items()
            if terms
        }
        self.aliases = {alias: tuple(sorted(keys)) for alias, keys in aliases.items()}
        self.date_generated = date_generated


def list_organisms(directory: Path) -> list[OrganismFile]:
    organisms: list[OrganismFile] = []
    if not directory.exists():
        return organisms
    for path in sorted(directory.glob("*.gaf.gz")):
        key = path.name.removesuffix(".gaf.gz")
        organisms.append(
            OrganismFile(
                key=key,
                label=ORGANISM_LABELS.get(key, key),
                file=str(path),
                size=path.stat().st_size,
            )
        )
    return organisms


@lru_cache(maxsize=4)
def load_annotations(directory: str, organism_key: str) -> AnnotationIndex:
    root = Path(directory)
    organisms = {organism.key: organism for organism in list_organisms(root)}
    if organism_key not in organisms:
        raise KeyError(organism_key)

    organism = organisms[organism_key]
    genes: dict[str, GeneRecord] = {}
    term_to_gene_keys: dict[str, set[str]] = {}
    gene_to_terms: dict[str, set[str]] = {}
    gene_to_terms_experimental: dict[str, set[str]] = {}
    aliases: dict[str, set[str]] = {}
    date_generated: str | None = None

    with gzip.open(organism.file, "rt", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith("!"):
                if line.startswith("!date-generated:"):
                    date_generated = line.split(":", 1)[1].strip()
                continue

            parts = line.rstrip("\n").split("\t")
            if len(parts) < 15:
                continue

            if "NOT" in parts[3].split("|"):
                continue

            db = parts[0]
            object_id = parts[1]
            symbol = parts[2] or object_id
            go_id = parts[4]
            evidence = parts[6]
            name = parts[9]
            synonyms = parts[10].split("|") if len(parts) > 10 and parts[10] else []
            taxon = parts[12]
            gene_key = f"{db}:{object_id}"

            if gene_key not in genes:
                genes[gene_key] = GeneRecord(
                    key=gene_key,
                    db=db,
                    object_id=object_id,
                    symbol=symbol,
                    name=name,
                    taxon=taxon,
                )

            term_to_gene_keys.setdefault(go_id, set()).add(gene_key)
            gene_to_terms.setdefault(gene_key, set()).add(go_id)
            if evidence != ELECTRONIC_EVIDENCE:
                gene_to_terms_experimental.setdefault(gene_key, set()).add(go_id)

            for alias in (symbol, object_id, gene_key, *synonyms):
                normalized = _normalize(alias)
                if normalized:
                    aliases.setdefault(normalized, set()).add(gene_key)

    return AnnotationIndex(
        organism,
        genes,
        term_to_gene_keys,
        gene_to_terms,
        aliases,
        date_generated,
        gene_to_terms_experimental,
    )


def gene_json(record: GeneRecord) -> dict[str, object]:
    return {
        "key": record.key,
        "db": record.db,
        "objectId": record.object_id,
        "symbol": record.symbol,
        "name": record.name,
        "taxon": record.taxon,
        "termCount": record.term_count,
    }


def organism_json(organism: OrganismFile) -> dict[str, object]:
    return {
        "key": organism.key,
        "label": organism.label,
        "file": organism.file,
        "size": organism.size,
    }


def _normalize(value: str) -> str:
    return value.strip().upper()
