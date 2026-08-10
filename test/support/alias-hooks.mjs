// Resolve hook that mirrors tsconfig.json's "@/*" -> "./*" path alias so
// route/lib modules can be loaded directly by `node --test` without a
// bundler. Only "@/..." specifiers are touched; everything else is passed
// through untouched.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

function resolveAliasPath(specifier) {
  const rel = specifier.slice(2); // strip "@/"
  const base = path.join(ROOT, rel);

  if (existsSync(base) && statSync(base).isFile()) return base;

  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }

  for (const ext of EXTENSIONS) {
    const candidate = path.join(base, "index" + ext);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

const VIRTUAL_MODULES = {
  "server-only": new URL("./server-only-shim.mjs", import.meta.url).href,
  "client-only": new URL("./server-only-shim.mjs", import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in VIRTUAL_MODULES) {
    return nextResolve(VIRTUAL_MODULES[specifier], context);
  }

  if (specifier.startsWith("@/")) {
    const resolved = resolveAliasPath(specifier);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // next's package.json has no "exports" map, so plain ESM resolution
    // can't find extensionless subpaths like "next/server" the way Next's
    // own bundler (or CJS require()) can. Retry with ".js" appended.
    if (err?.code === "ERR_MODULE_NOT_FOUND" && /^next\//.test(specifier) && !path.extname(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw err;
  }
}
