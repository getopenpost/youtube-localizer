# YouTube Localizer

A standalone Chromium extension by [OpenPost](https://openpo.st). Select YouTube videos, choose languages, and localize their titles, descriptions and thumbnails using your own AI providers.

No OpenPost account, Google OAuth or application backend. The extension uses your existing YouTube Studio session. Translated packaging does not translate a video's audio or subtitles.

## Install locally

```sh
devenv shell
npm ci
npm run build
```

1. Open `chrome://extensions` in Chrome or Chromium.
2. Enable Developer mode and choose **Load unpacked**.
3. Select this repository's `dist` directory.
4. Pin YouTube Localizer and click its icon to open the side panel.
5. Open YouTube Studio in English. This first version stops on unsupported Studio layouts rather than guessing controls.

`npm run package` creates `artifacts/youtube-localizer-0.1.0.zip`. Extract it and load the extracted folder. The ZIP is also suitable for a future store submission, after the live pilot and publication checks below.

## Use it

1. Open a channel's Content page or an individual video in Studio.
2. Open the extension and read the current page. Discovery reads this page only; it does not scan the whole channel.
3. Open Settings. Configure a text provider, then save the channel's source language, targets, components and glossary. Fal is optional for text-only work.
4. Select videos and **Check missing translations**. Preflight opens a dedicated Studio working tab and checks each selected video. Unknown data is never treated as empty.
5. **Generate missing**. Review titles and descriptions in the larger workspace.
6. For thumbnails, inspect the cached source dimensions. Use another image when Studio only exposes a small preview. Enter visible text manually or deliberately read it with a vision model. Confirm the source text, generate the translated wording, then approve the exact replacement strings before generating images.
7. Edit and approve individual components. Select the dedicated Studio working tab and **Apply approved**. Application runs one writer, reads the target again, preserves existing content, reloads Studio and verifies saved text.

The video's declared language takes priority over its channel fallback. Regional target codes stay distinct. Unavailable languages stay unreadable and cannot generate or apply.

Visibility and schedules are read as guards. The writer only operates language dialogs. Source details, publication dates, visibility, audio and subtitles are outside its write boundary.

## Providers

- OpenAI Chat Completions, with a configurable model.
- Anthropic Messages, with a configurable model.
- Custom OpenAI-compatible base URLs. HTTPS is required except for localhost. Optional authentication supports local servers.
- Fal's Nano Banana and Nano Banana Pro image-editing endpoints, using the persistent queue API. Every image starts from the same cached source. Output uploads are 1280 × 720 JPEGs below 2 MB.

API access is separate from ChatGPT or Claude subscription access. Host permissions are requested for configured providers when you save Settings. Keys never enter Studio's page context or content-script messages.

Generation costs are paid to your providers. A per-run request limit bounds new submissions, not a currency amount. Pause prevents new paid requests and Studio mutations. Already-submitted work can still finish and incur charges.

## Recovery and privacy

Jobs are stored by channel, video, language and component. IndexedDB holds source hashes, generated text, image assets, provider settings fingerprints, queue receipts, application status and last observed Studio evidence. A service-worker wake advances persisted checkpoints rather than recreating an in-memory queue.

A restarted worker polls a stored Fal receipt. A request interrupted before its receipt was saved becomes **Check provider outcome**. It is never automatically submitted again. Check the provider dashboard before explicitly accepting a possible second charge. Failed application retains generated assets.

Session-only keys are the default. **Remember keys on this device** uses local browser storage, which is not an OS-backed vault. Sensitive Chrome storage is restricted to trusted extension contexts. Keys do not use Chrome Sync and do not appear in exports or logs. Forget them from Settings.

The extension has no telemetry. Titles and descriptions go to your text provider. Source thumbnails go to Fal and its model-processing chain. Generated images are retrieved directly from Fal's output hosts. No media passes through OpenPost.

Export a backup from Settings before uninstalling. Backups include cached history and image assets, without credentials or signed Studio thumbnail URLs. Imports merge rather than overwrite local work and remove approval and verification authority. Run preflight again after importing.

## Development and checks

```sh
npm run dev        # UI preview at http://127.0.0.1:4397/review.html?preview=1
npm run check      # TypeScript, ESLint and formatting
npm test           # Persistence, planning, provider and archive contracts
npm run test:browser # Packaged extension in isolated Chromium profiles
npm run verify
```

Before browser tests, install the project browser with `npx playwright install chromium`. Tests intercept all Studio and provider traffic and use fixture-only credentials. They do not operate a real channel or spend money. Test profiles are removed after each run.

The browser preview explicitly labels illustrative data. It has no Studio connection and cannot make paid requests. Preview data is excluded from the production build.

Code ownership and safety rules are in [AGENTS.md](AGENTS.md). [PRODUCT.md](PRODUCT.md) records the supplied requirements. [DESIGN.md](DESIGN.md) records the UI system.

## Pilot and publication status

This is an initial implementation for local pilot testing, not a store release. Read-only live Studio inspection confirmed discovery, language-picker IDs, video details, the current translations table and visibility selectors. Local automated tests cover the packaged extension against controlled Studio fixtures.

A real scheduled-video pilot is required before publishing. Follow [docs/pilot.md](docs/pilot.md). Real text dialogs, thumbnail uploads, provider billing, schedule preservation and interruption recovery must be verified on the chosen pilot video. Browser fixtures do not establish those live facts. Thumbnail application remains **Needs verification** when Studio's processed image cannot be identified conclusively.

The working name and YouTube-related naming must be checked before public/store publication. This project is intended for `getopenpost/youtube-localizer`; it does not require or modify the OpenPost repository.
