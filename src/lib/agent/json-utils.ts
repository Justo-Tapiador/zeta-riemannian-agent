// zeta-riemannian-agent v1.0 — Robust JSON extractor
//
// LLMs frequently return JSON containing LaTeX (e.g. \zeta, \sigma) which
// is NOT valid JSON because \z is not a recognised escape. This module
// extracts the JSON object from a model response and repairs common LaTeX
// escape issues before parsing.

const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

export function extractJsonObject(text: string): string | null {
  // Find the first {...} block in the text.
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function repairJsonLatex(jsonStr: string): string {
  // Inside string literals, escape any backslash that is NOT followed by a
  // valid JSON escape character. This converts \zeta -> \\zeta, \sigma -> \\sigma, etc.
  let out = '';
  let inString = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const c = jsonStr[i];
    if (c === '"' && jsonStr[i - 1] !== '\\') {
      inString = !inString;
      out += c;
      continue;
    }
    if (inString && c === '\\') {
      const next = jsonStr[i + 1];
      if (next && !VALID_ESCAPES.has(next)) {
        // This is a LaTeX-style backslash; double-escape it.
        out += '\\\\';
        continue;
      }
    }
    out += c;
  }
  return out;
}

export function safeJsonParse<T>(text: string): T | null {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;
  // First try raw parse.
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Try the repaired version.
    try {
      return JSON.parse(repairJsonLatex(candidate)) as T;
    } catch {
      return null;
    }
  }
}
