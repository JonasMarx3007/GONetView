import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve("frontend", "dist");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 5174);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
  const pathname = decodeURIComponent(url.pathname);
  const normalized = normalize(pathname).replace(/^([/\\])+/, "");
  const candidate = resolve(root, normalized);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const file = resolveFile(candidate);
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const gzipFile = `${file}.gz`;
  const useGzip = (request.headers["accept-encoding"] ?? "").includes("gzip") && existsSync(gzipFile);

  response.writeHead(200, {
    "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
    ...(useGzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
    "Cache-Control": "no-cache",
  });
  createReadStream(useGzip ? gzipFile : file).pipe(response);
}).listen(port, host, () => {
  console.log(`GONetView preview: http://${host}:${port}/`);
});

function resolveFile(candidate) {
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    const index = join(candidate, "index.html");
    if (existsSync(index)) {
      return index;
    }
  }
  const fallback = join(root, "index.html");
  return existsSync(fallback) ? fallback : "";
}
