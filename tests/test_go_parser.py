from pathlib import Path
import tempfile
import unittest

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from go_data.go_parser import parse_obo


class GoParserTests(unittest.TestCase):
    def test_parse_obo_terms_relations_and_levels(self) -> None:
        obo = """format-version: 1.2
data-version: releases/2026-03-25

[Term]
id: GO:0000001
name: root process
namespace: biological_process
def: "Root definition." [GOC:test]

[Term]
id: GO:0000002
name: child process
namespace: biological_process
def: "Child definition." [GOC:test]
is_a: GO:0000001 ! root process
relationship: part_of GO:0000001

[Term]
id: GO:0000003
name: obsolete process
namespace: biological_process
is_obsolete: true
"""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "go-basic.obo"
            path.write_text(obo, encoding="utf-8")

            graph = parse_obo(path)

        self.assertEqual(graph.data_version, "releases/2026-03-25")
        self.assertEqual(set(graph.terms), {"GO:0000001", "GO:0000002", "GO:0000003"})
        self.assertEqual(graph.terms["GO:0000002"].parents, ("GO:0000001",))
        self.assertEqual(
            {(relation.target, relation.type) for relation in graph.terms["GO:0000002"].relations},
            {("GO:0000001", "is_a"), ("GO:0000001", "part_of")},
        )
        self.assertEqual(graph.levels["GO:0000001"], 0)
        self.assertEqual(graph.levels["GO:0000002"], 1)
        self.assertEqual(graph.edge_count, 1)
        self.assertEqual(graph.namespaces, ("biological_process",))


if __name__ == "__main__":
    unittest.main()
