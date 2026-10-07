# YouTube Localizer

<!-- impeccable:product-schema 1 -->

## Platform

Web, as a standalone Manifest V3 extension for Chrome and Chromium.

## Stack

TypeScript, Svelte 5, Vite, IndexedDB through idb, Zod for external data, and fflate for portable ZIP archives. No application server.

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

## Current scope

GPT Image 2.5 Sunburst is the default editor. Ideogram 4.5 Edit supports very_low quality with high precision through Fal. Layerize Text prepares one reusable background and editable layout per source hash, then renders language variants locally. Manual wording avoids translation requests; AI wording still uses the text provider.

Support multiple Studio accounts/channels with isolated preferences and history, observed account selectors and one bound channel per batch. Main screens use one next action. Layout controls and advanced model settings are folded away. All provider access uses API keys; ChatGPT plan sign-in was removed from scope by the user.

## Original thumbnail generation

Save reusable person, brand and style reference images locally. Studio's video-details Thumbnail heading has a Generate launcher that captures title and description and opens the extension composer. The composer uses GPT Image 2.5 with selected reference images, or text-to-image generation without them. Persist requests and variants per video, support downloads and choosing a generated localization source. No automatic primary-thumbnail Studio writes or video-details saves. Library and creation history belong in private backups. Keep the existing simple interface.
