export type InputMode = "go" | "gene";

export function parseTerms(value: string): string[] {
  const entries: string[] = [];
  for (const line of value.replace(/[;,]/g, "\n").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every(isGoTermToken)) {
      entries.push(...tokens.map(normalizeGoTermToken));
    } else {
      entries.push(normalizeGoTermToken(trimmed));
    }
  }
  return Array.from(new Set(entries));
}

export function parseGenes(value: string): string[] {
  return Array.from(
    new Set(
      value
        .replace(/[;,]/g, " ")
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

export function activeSearchToken(value: string): string {
  const parts = value.replace(/[;,]/g, " ").split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function replaceActiveSearchToken(value: string, replacement: string): string {
  const lastToken = value.match(/[^\s,;]+$/);
  if (!lastToken || lastToken.index === undefined) {
    return appendSearchToken(value, replacement);
  }
  return `${value.slice(0, lastToken.index)}${replacement}`;
}

export function isAutoRefreshInputReady(mode: InputMode, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const token = activeSearchToken(value);
  if (mode === "go") {
    if (/^go:?\d{0,6}$/i.test(token)) {
      return false;
    }
    if (/^go:?\d+$/i.test(token) && !isGoTermToken(token)) {
      return false;
    }
    return isGoTermToken(token) || trimmed.length >= 3;
  }

  return token.length >= 2;
}

function isGoTermToken(value: string): boolean {
  return /^go:?\d{7}$/i.test(value.trim());
}

function normalizeGoTermToken(value: string): string {
  return value.trim().replace(/^go:?(\d{7})$/i, "GO:$1");
}

function appendSearchToken(value: string, replacement: string): string {
  const trimmed = value.trimEnd();
  if (!trimmed) {
    return replacement;
  }
  return `${trimmed}\n${replacement}`;
}
