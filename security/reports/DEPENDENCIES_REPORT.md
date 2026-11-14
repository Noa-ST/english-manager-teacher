# DEPENDENCIES Security Report

## Status: LOW

## Findings

Running `npm audit` flagged 12 vulnerabilities (2 low, 10 moderate) exclusively in devDependencies:
- `deepmerge` (prototype poisoning in `@shadcn/registry` / `shadcn`)
- `minimatch` (glob amplification in `@typescript-eslint/typescript-estree`)

None of these packages are included in client bundles or production runtime code.

## Recommendations

1. Keep lockfile `package-lock.json` committed.
2. Regularly run `npm update` or `npm audit fix` for developer tooling when compatible versions are released by upstream maintainers.

