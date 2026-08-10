# ADR-001: Replace google-tts-api with native URL construction

**Status:** Accepted
**Date:** 2026-08-10

## Context

The `say` and `saye` commands only use `google-tts-api` to construct a Google
Translate TTS URL. The package also installs Axios 0.21.4, which has high-severity
SSRF and credential-leakage advisories, despite these commands never using its
HTTP client functionality.

## Decision

We will construct the fixed Google Translate TTS URL with the platform
`URLSearchParams` API because it preserves the existing request contract without
retaining an unused vulnerable HTTP dependency.

## Consequences

### Positive

- Removes the vulnerable Axios dependency path.
- Keeps the TTS host fixed and validates text length at one shared boundary.
- Adds no replacement dependency.

### Negative / Trade-offs

- Google Translate TTS is not a documented public API, so its query contract may
  change and require an update to the shared URL builder.

## Alternatives Considered

| Option | Why rejected |
| ------ | ------------ |
| Override Axios to a newer major | `google-tts-api` declares an Axios 0.x range, so forcing an incompatible major would be an untested transitive contract change. |
| Add another TTS URL package | Two small callers do not justify another supply-chain dependency. |
