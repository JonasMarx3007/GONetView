from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

SUPPORTED_RELATIONS = (
    "is_a",
    "part_of",
    "occurs_in",
    "regulates",
    "positively_regulates",
    "negatively_regulates",
)


@dataclass(frozen=True)
class GORelation:
    target: str
    type: str


@dataclass(frozen=True)
class GOTerm:
    id: str
    name: str
    namespace: str
    definition: str
    parents: tuple[str, ...]
    relations: tuple[GORelation, ...] = ()
    obsolete: bool = False


@dataclass(frozen=True)
class GOGraph:
    terms: dict[str, GOTerm]
    levels: dict[str, int]
    data_version: str | None

    @property
    def edge_count(self) -> int:
        return sum(len(term.parents) for term in self.terms.values() if not term.obsolete)

    @property
    def namespaces(self) -> tuple[str, ...]:
        return tuple(sorted({term.namespace for term in self.terms.values() if not term.obsolete}))

    @property
    def max_ancestor_depth(self) -> int:
        return max(self.levels.values(), default=0)

    @property
    def max_descendant_depth(self) -> int:
        return self.max_ancestor_depth


def parse_obo(path: Path) -> GOGraph:
    terms: dict[str, GOTerm] = {}
    data_version: str | None = None

    current: dict[str, object] | None = None
    in_term = False

    def commit(term_data: dict[str, object] | None) -> None:
        if not term_data:
            return
        term_id = str(term_data.get("id", ""))
        if not term_id:
            return
        parents = tuple(dict.fromkeys(term_data.get("parents", ())))
        relation_pairs = tuple(
            GORelation(str(target), str(relation_type))
            for relation_type, target in term_data.get("relations", ())
            if relation_type in SUPPORTED_RELATIONS and str(target)
        )
        terms[term_id] = GOTerm(
            id=term_id,
            name=str(term_data.get("name", term_id)),
            namespace=str(term_data.get("namespace", "")),
            definition=str(term_data.get("definition", "")),
            parents=parents,
            relations=relation_pairs,
            obsolete=bool(term_data.get("obsolete", False)),
        )

    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("data-version:"):
                data_version = line.split(":", 1)[1].strip()
                continue
            if line == "[Term]":
                commit(current)
                current = {"parents": [], "relations": []}
                in_term = True
                continue
            if line.startswith("[") and line.endswith("]"):
                commit(current)
                current = None
                in_term = False
                continue
            if not in_term or current is None:
                continue
            if line.startswith("id:"):
                current["id"] = line.split(":", 1)[1].strip()
            elif line.startswith("name:"):
                current["name"] = line.split(":", 1)[1].strip()
            elif line.startswith("namespace:"):
                current["namespace"] = line.split(":", 1)[1].strip()
            elif line.startswith("def:"):
                current["definition"] = _clean_definition(line.split(":", 1)[1].strip())
            elif line.startswith("is_obsolete: true"):
                current["obsolete"] = True
            elif line.startswith("is_a:"):
                parent = line.split("!", 1)[0].split(":", 1)[1].strip()
                current.setdefault("parents", []).append(parent)
            elif line.startswith("relationship:"):
                parts = line.split()
                if len(parts) >= 3 and parts[1] in SUPPORTED_RELATIONS:
                    current.setdefault("relations", []).append((parts[1], parts[2]))
        commit(current)

    for term in tuple(terms.values()):
        filtered_parents = tuple(parent for parent in term.parents if parent in terms)
        filtered_relations = tuple(
            relation for relation in term.relations if relation.target in terms and relation.type != "is_a"
        )
        combined_relations = tuple(
            [*(GORelation(parent, "is_a") for parent in filtered_parents), *filtered_relations]
        )
        if filtered_parents != term.parents or combined_relations != term.relations:
            terms[term.id] = GOTerm(
                id=term.id,
                name=term.name,
                namespace=term.namespace,
                definition=term.definition,
                parents=filtered_parents,
                relations=combined_relations,
                obsolete=term.obsolete,
            )

    return GOGraph(
        terms=terms,
        levels=_compute_levels(terms),
        data_version=data_version,
    )


def _clean_definition(value: str) -> str:
    if value.startswith('"'):
        end = value.find('"', 1)
        if end > 0:
            return value[1:end]
    return value


def _compute_levels(terms: dict[str, GOTerm]) -> dict[str, int]:
    memo: dict[str, int] = {}

    def level(term_id: str, visiting: set[str]) -> int:
        cached = memo.get(term_id)
        if cached is not None:
            return cached
        if term_id in visiting:
            return 0
        visiting.add(term_id)
        parents = tuple(parent for parent in terms[term_id].parents if parent in terms)
        value = 0 if not parents else max(level(parent, visiting) for parent in parents) + 1
        visiting.remove(term_id)
        memo[term_id] = value
        return value

    for term_id in terms:
        level(term_id, set())
    return memo
