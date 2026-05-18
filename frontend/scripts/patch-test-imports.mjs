import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const buildDir = new URL("../.test-build/", import.meta.url);

for (const file of await jsFiles(buildDir)) {
  const source = await readFile(file, "utf8");
  const patched = source.replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (_match, prefix, specifier, suffix) => {
    if (/\.[cm]?js$/.test(specifier)) {
      return `${prefix}${specifier}${suffix}`;
    }
    return `${prefix}${specifier}.js${suffix}`;
  });
  if (patched !== source) {
    await writeFile(file, patched);
  }
}

async function jsFiles(directoryUrl) {
  const directory = fileURLToPath(directoryUrl);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await jsFiles(new URL(`${entry.name}/`, directoryUrl)));
    } else if (entry.isFile() && entry.name.endsWith(".js") && (await stat(path)).size > 0) {
      files.push(path);
    }
  }
  return files;
}
