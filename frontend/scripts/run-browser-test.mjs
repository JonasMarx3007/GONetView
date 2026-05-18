import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4175;
const serverUrl = `http://127.0.0.1:${port}`;
const viteArgs = ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port)];
const testArgs = ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.config.ts"];

const server = spawn(process.execPath, viteArgs, {
  cwd: new URL("..", import.meta.url),
  stdio: ["ignore", "pipe", "pipe"],
  shell: false,
});

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  await waitForServer(serverUrl, 30_000);
  const status = await run(testArgs);
  process.exitCode = status;
} finally {
  server.kill();
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: new URL("..", import.meta.url),
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function waitForServer(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the dev server accepts connections.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
