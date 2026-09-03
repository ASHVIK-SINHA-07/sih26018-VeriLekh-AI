/**
 * Module resolution hook that teaches Node the `@/*` path alias from
 * tsconfig.json, so the unit tests can run on Node's built-in test runner
 * without adding a test framework or a bundler.
 *
 * Node resolves `@/lib/ocr` to src/lib/ocr.ts; TypeScript already understands
 * the alias, so nothing in src/ has to change shape to be testable.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve(process.cwd(), "src");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js"];

function resolveAlias(specifier) {
  const base = path.join(SRC, specifier.slice(2));

  if (existsSync(base) && !existsSync(`${base}.ts`)) {
    // Directory import — look for an index file inside it.
    for (const ext of EXTENSIONS) {
      const candidate = path.join(base, `index${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }

  if (existsSync(base) && path.extname(base)) return base;

  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = resolveAlias(specifier);
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
