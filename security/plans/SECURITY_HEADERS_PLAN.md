# SECURITY_HEADERS Fix Plan

## Changes

- `next.config.ts`:
  - Define a strict `Content-Security-Policy` header.
  - Set `productionBrowserSourceMaps: false`.

## Proposed CSP baseline:
```text
default-src 'self';
script-src 'self' 'unsafe-eval' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' https:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
```

## Verification goals

- [ ] `Content-Security-Policy` header is present in responses from `next.config.ts`.
- [ ] No `eval` or unsafe external scripts executed without allowance.
- [ ] Production build passes `npm run build` and `npm run typecheck`.
- [ ] Existing image loading from S3/Cloudinary works smoothly with `img-src 'self' data: blob: https:`.

