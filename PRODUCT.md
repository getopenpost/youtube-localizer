# YouTube Localizer

<!-- impeccable:product-schema 1 -->

## Platform

Web, as a standalone Manifest V3 extension for Chrome and Chromium.

## Stack

Delegated by the implementation request. TypeScript, React, Vite, IndexedDB through idb, Zod for external data, and fflate for portable ZIP archives. No application server.

## Users and purpose

Creators and channel managers select videos, choose target languages, and localize titles, descriptions and thumbnails using their own AI providers. A pilot use case is a teacher preparing scheduled classes in several languages.

## Workflow

Open Studio, discover the current video or current content page, select videos, check existing translations, generate missing components, review, then apply approved components. Source and target languages, components and a glossary belong to each channel.

## Constraints

No OpenPost account, Google OAuth, operator backend, audio, subtitles, scheduling or deletion. Use the existing Studio session. Preserve existing translations. Unknown state is never missing. Read targets again before writes and verify after saving. One Studio writer at a time. Stop new paid requests when paused. An ambiguous paid submission must not be retried automatically. Local checkpoints and provider request IDs must survive worker shutdown. Keys stay in trusted extension storage, session-only by default, excluded from exports.

## Brand

Working name: YouTube Localizer, by OpenPost. Include an OpenPost CTA in About and onboarding. No promotional interruptions during batches. Translated packaging does not mean translated audio.

## Evidence

The user supplied an eight-part proposal. Live, read-only Studio inspection on 2026-10-07 confirmed the content list, details route, translations route, and language-picker codes on an English Studio UI. Real paid generation and scheduled-video writes remain pilot gates until verified. No fabricated live success claims.
