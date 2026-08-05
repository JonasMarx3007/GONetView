import gzip
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


def gaf_row(object_id: str, symbol: str, go_id: str, synonyms: str = "", evidence: str = "IDA") -> str:
    return "\t".join(
        [
            "UniProtKB",
            object_id,
            symbol,
            "",
            go_id,
            "PMID:1",
            evidence,
            "",
            "P",
            f"{symbol} name",
            synonyms,
            "protein",
            "taxon:9606",
            "20260518",
            "GONetViewTest",
            "",
            "",
        ]
    )


class PreprocessDataTests(unittest.TestCase):
    def test_preprocess_writes_static_browser_indexes_split_by_evidence(self) -> None:
        repo = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw = root / "raw"
            output = root / "out"
            annotations = raw / "annotations"
            annotations.mkdir(parents=True)
            (raw / "go-basic.obo").write_text(
                """format-version: 1.2
data-version: test-release

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
""",
                encoding="utf-8",
            )
            with gzip.open(annotations / "mini.gaf.gz", "wt", encoding="utf-8") as handle:
                handle.write("!gaf-version: 2.2\n")
                handle.write("!date-generated: 2026-05-18\n")
                handle.write(gaf_row("P1", "GENE1", "GO:0000001", "ALPHA") + "\n")
                handle.write(gaf_row("P1", "GENE1", "GO:0000002", "ALPHA") + "\n")
                handle.write(gaf_row("P2", "GENE2", "GO:0000002", "BETA", "IEA") + "\n")

            completed = subprocess.run(
                [
                    sys.executable,
                    str(repo / "scripts" / "preprocess_data.py"),
                    "--raw-data-root",
                    str(raw),
                    "--output",
                    str(output),
                    "--organism",
                    "mini",
                ],
                cwd=repo,
                text=True,
                capture_output=True,
                check=True,
            )

            self.assertIn("Reading ontology", completed.stdout)
            ontology_manifest = read_json(output / "go" / "manifest.json")
            terms = read_json(output / "go" / "terms.json")
            term_search = read_json(output / "go" / "term-search.json")
            annotation_manifest = read_json(output / "annotations" / "mini" / "manifest.json")
            genes = read_json(output / "annotations" / "mini" / "genes.json")
            aliases = read_json(output / "annotations" / "mini" / "aliases.json")
            term_to_genes = read_json(output / "annotations" / "mini" / "term-to-genes.json")
            gene_to_terms = read_json(output / "annotations" / "mini" / "gene-to-terms.json")
            curated = read_json(output / "annotations" / "mini" / "gene-to-terms-experimental.json")

            self.assertEqual(ontology_manifest["stats"]["dataVersion"], "test-release")
            self.assertEqual(ontology_manifest["stats"]["terms"], 2)
            self.assertEqual(ontology_manifest["organisms"][0]["key"], "mini")
            self.assertEqual([term["id"] for term in terms], ["GO:0000001", "GO:0000002"])
            self.assertIn(["GO:0000001", "part_of"], terms[1]["relations"])
            self.assertEqual(term_search[1]["search"], "go:0000002 go0000002 child process")
            self.assertEqual(annotation_manifest["dateGenerated"], "2026-05-18")
            self.assertEqual(genes[0]["termCount"], 2)
            self.assertEqual(aliases["GENE1"], ["UniProtKB:P1"])
            self.assertEqual(term_to_genes["GO:0000002"], ["UniProtKB:P1", "UniProtKB:P2"])
            self.assertEqual(gene_to_terms["UniProtKB:P1"], ["GO:0000001", "GO:0000002"])

            # Electronic annotations stay out of the curated index but remain in the full one.
            self.assertEqual(gene_to_terms["UniProtKB:P2"], ["GO:0000002"])
            self.assertNotIn("UniProtKB:P2", curated)
            self.assertEqual(curated["UniProtKB:P1"], ["GO:0000001", "GO:0000002"])
            self.assertEqual(annotation_manifest["evidence"], {"annotatedGenes": 2, "genesWithCuratedEvidence": 1})
            self.assertEqual(
                annotation_manifest["files"]["geneToTermsExperimental"],
                "annotations/mini/gene-to-terms-experimental.json",
            )

            # Nothing requests the gzip sidecars, so they are no longer written.
            self.assertEqual(sorted(path.name for path in (output / "go").glob("*.gz")), [])
            self.assertEqual(sorted(path.name for path in (output / "annotations" / "mini").glob("*.gz")), [])


def read_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


if __name__ == "__main__":
    unittest.main()
