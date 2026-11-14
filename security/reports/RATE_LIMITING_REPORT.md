# RATE_LIMITING Security Report

## Status: MEDIUM

## Findings

In `src/app/api/auth/login/route.ts` and `src/app/api/auth/reset-password/route.ts`:
- Requests are handled directly without a local rate limiting middleware.
- In contrast, `src/services/storage.service.ts` has a well-designed sliding window bucket rate limiter (`checkUploadRateLimit`).

## What's at risk

An attacker could attempt brute-force dictionary attacks against teacher/student login or spam password reset emails. While Supabase Auth has rate limits at the API gateway layer, an application-level rate limiter protects against excessive connection load and upstream quota exhaustion.

## Recommendations

1. Implement an in-memory or Redis/KV sliding window rate limiter for `/api/auth/login` (e.g. max 5 failed attempts per 15 minutes per IP).
2. Protect `/api/auth/reset-password` with similar limits (e.g. max 3 requests per hour per IP/email).

