import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.APP_IS_TEST = "true";

const projectRoot = process.cwd();

function resolveCandidate(basePath) {
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.js"),
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      const headersPath = path.join(projectRoot, "node_modules", "next", "headers.js");
      if (fs.existsSync(headersPath)) {
        return { url: pathToFileURL(headersPath).href, shortCircuit: true };
      }
    }

    if (specifier.startsWith("@/")) {
      const target = path.join(projectRoot, "src", specifier.slice(2));
      const resolved = resolveCandidate(target);
      if (resolved) {
        return { url: resolved, shortCircuit: true };
      }
    }

    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(new URL(context.parentURL).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
      const target = path.resolve(parentDir, specifier);
      const resolved = resolveCandidate(target);
      if (resolved) {
        return { url: resolved, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});

