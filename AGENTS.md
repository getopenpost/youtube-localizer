# YouTube Localizer

- Standalone MV3 Chromium extension. No OpenPost API, Google OAuth, telemetry, remote code or operator backend.
- Run `npm ci`, `npm run verify`, and `npm run package` in the project Devenv environment. Browser tests use isolated profiles and intercepted Studio/provider responses, never real accounts or keys.
- `src/studio` owns DOM discovery and tightly scoped translation-dialog writes. Never alter visibility, scheduling, audio, subtitles or deletion. Read unknown data as unknown, never empty. Support English Studio first and stop with instructions on unsupported UI rather than guessing labels.
- `src/core` owns durable jobs and missing-only plans. Store component source hashes and generated assets before application. Recheck Studio before writes. Image verification remains uncertain unless Studio exposes sufficient evidence.
- `src/providers` owns paid network requests. Persist submitting before the request and Fal request IDs before polling. Never automatically retry an ambiguous submission. Credentials belong only to trusted extension contexts; never content messages, logs, exports or sync storage.
- Service-worker runs advance through persisted checkpoints. Use a single Web Lock for coordinator work and a separate durable pause epoch checked before paid requests and before Studio mutations.
- External data and messages require schema validation. Imported history is a cache and must lose approval/verification authority. ZIP archives exclude credentials and remote URLs.
- Consult PRODUCT.md, DESIGN.md and docs/ui-brief.md for UI scope and tokens. Keep OpenPost's CTA in About/onboarding.
- `docs/pilot.md` owns the live scheduled-video acceptance gate. Fixture tests do not prove live application.
