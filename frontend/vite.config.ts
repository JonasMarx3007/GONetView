import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(path: string | undefined): string {
  const trimmed = (path ?? "/").trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig({
  plugins: [react()],
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
});
