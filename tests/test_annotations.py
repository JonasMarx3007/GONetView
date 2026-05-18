import gzip
from pathlib import Path
import tempfile
import unittest

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from go_data.annotations import list_organisms, load_annotations


def gaf_row(
    object_id: str,
    symbol: str,
    qualifier: str,
    go_id: str,
    name: str,
    synonyms: str = "",
) -> str:
    return "\t".join(
        [
            "UniProtKB",
            object_id,
            symbol,
            qualifier,
            go_id,
            "PMID:1",
            "IDA",
            "",
            "P",
            name,
            synonyms,
            "protein",
            "taxon:9606",
            "20260518",
            "GONetViewTest",
            "",
            "",
        ]
    )


class AnnotationTests(unittest.TestCase):
    def test_load_annotations_indexes_genes_terms_and_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            annotations_dir = Path(tmp)
            gaf_path = annotations_dir / "mini.gaf.gz"
            with gzip.open(gaf_path, "wt", encoding="utf-8") as handle:
                handle.write("!gaf-version: 2.2\n")
                handle.write("!date-generated: 2026-05-18\n")
                handle.write(gaf_row("P1", "GENE1", "", "GO:0000001", "Gene one", "ALPHA|BETA") + "\n")
                handle.write(gaf_row("P1", "GENE1", "", "GO:0000002", "Gene one", "ALPHA") + "\n")
                handle.write(gaf_row("P2", "GENE2", "NOT", "GO:0000003", "Gene two") + "\n")

            load_annotations.cache_clear()
            organisms = list_organisms(annotations_dir)
            index = load_annotations(str(annotations_dir), "mini")

        self.assertEqual([organism.key for organism in organisms], ["mini"])
        self.assertEqual(index.date_generated, "2026-05-18")
        self.assertEqual(set(index.genes), {"UniProtKB:P1"})
        self.assertEqual(index.term_to_genes["GO:0000001"], ("UniProtKB:P1",))
        self.assertEqual(index.gene_to_terms["UniProtKB:P1"], ("GO:0000001", "GO:0000002"))
        self.assertIn("GENE1", index.aliases)
        self.assertIn("ALPHA", index.aliases)
        self.assertNotIn("GENE2", index.aliases)


if __name__ == "__main__":
    unittest.main()
