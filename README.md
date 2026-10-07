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

`npm run package` creates `artifacts/youtube-localizer-0.4.0.zip`. Extract it and load the extracted folder. The ZIP is also suitable for a future store submission, after the live pilot and publication checks below.

## Use it

1. Open a channel's Content page or an individual video in Studio.
2. Open the extension and read the current page. Discovery reads this page only; it does not scan the whole channel.
3. Open Settings. Configure a text provider, then save the channel's source language, targets, components and glossary. OpenAI handles text and thumbnails by default. Other providers are under Advanced.
4. Select videos and **Check missing translations**. Preflight binds the channel’s Studio tab and checks each selected video. Unknown data is never treated as empty.
5. **Generate missing**. Review titles and descriptions in the larger workspace.
6. For thumbnails, inspect the cached source dimensions. Use another image when Studio only exposes a small preview. Enter visible text manually or deliberately read it with a vision model. Confirm the source text, generate the translated wording, then approve the exact replacement strings before generating images.
7. Edit and approve individual components. Select the dedicated Studio working tab and **Apply approved**. Application runs one writer, reads the target again, preserves existing content, reloads Studio and verifies saved text.

The video's declared language takes priority over its channel fallback. Regional target codes stay distinct. Unavailable languages stay unreadable and cannot generate or apply.

Visibility and schedules are read as guards. The writer only operates language dialogs. Source details, publication dates, visibility, audio and subtitles are outside its write boundary.

## Multiple YouTube accounts

Keep each account's channel open in a separate Studio tab. Choose **Add account**, switch accounts with Studio's own account menu, then **Read current Studio page**. The channel picker remembers connected channels. Languages, glossaries and history stay separate. Batch execution remains one channel at a time.

Navigation preserves the observed `authuser` selector. An account or channel change in the bound tab stops the batch. If a tab is closed, preflight can reopen its observed account route, then verifies the channel before reading or writing. After importing a backup, connect each account again.

## Generate original thumbnails

Open a video's **Details** page in English Studio. **Generate** appears beside the Thumbnail heading. It opens the extension's composer with that video's title and description. The extension header also opens the composer/reference library, and Review offers **Generate thumbnail** beside the source image.

Add face, brand or style images once, then select the references you want for each video. **Manage references** lets you rename them, set their role or remove them from the library. References are stored only in this browser. Uploads are re-encoded as PNGs, with metadata removed and their longest edge capped at 2048 pixels. Adding or browsing references makes no provider request.

Describe the scene, layout and headline, then select **Generate**. Original thumbnail creation uses [GPT Image 2.5](https://developers.openai.com/api/docs/guides/image-generation), independently of the localization image provider. With references it sends only the selected image bytes and optional source thumbnail to OpenAI; without references it uses text-to-image generation. Each submitted generation creates one paid image request. The model and quality follow the OpenAI image settings, and an OpenAI API key is required. Provider permission is requested before the first call.

Generated variants, prompts and reference snapshots are cached per video. Reopening the composer makes no new paid request. Download a 1280 × 720 JPEG to upload through Studio, or choose **Use for localization** to make it the local source for language variants. Generation does not change Studio's primary thumbnail or save video details. The existing reviewed language-dialog writer is unchanged.

Backups include reference images and creation history, so keep them private. Removing a library entry does not remove bytes retained by historical requests or generated work. Interrupted generations retain their request ID when available and require checking OpenAI before explicitly accepting another charge.

## Editable thumbnails with Ideogram

Select **Ideogram editable text** in Settings and add a Fal key. In Review, **Prepare editable text · paid once** submits the cached source to [Layerize Text](https://fal.ai/models/fal-ai/ideogram/v3/layerize-text/api). The extension saves its receipt, downloads the clean background and converts the static overlay into editable text boxes. One preparation is reused for the same source image across videos and languages.

Review the source preview, correct its text, and approve the layout. **Adjust layout** exposes position, size, font, alignment, color, outline, spacing and rotation. Drag boxes in the preview or use the numeric controls. Add boxes manually if extraction misses them. Clear typography works best; decorative lettering and mixed styles may need correction, and bundled/system fonts can differ from the original.

Enter each language's exact wording manually for entirely local variants, or use **Generate missing** to translate with your text provider. Approve wording, then generate the images. Local composition wraps and shrinks text to fit, shapes right-to-left scripts, and rejects text that still cannot fit. It produces 1280 × 720 JPEGs with no new image-generation request. AI translation still uses paid text requests.

Changing the layout invalidates old image approvals. Select **Generate missing** to render updated layouts locally. Each thumbnail also has a disclosure to queue an individual render. Backups include the clean background and editable layout. Imports remove approval so you can review them before use.

## Providers

- OpenAI Chat Completions, with a configurable model.
- Anthropic Messages, with a configurable model.
- Custom OpenAI-compatible base URLs. HTTPS is required except for localhost. Optional authentication supports local servers.
- GPT Image 2.5 Sunburst is the default image editor. GPT Image 2.5 Flare, Ideogram 4.5 Edit and Fal's Nano Banana models are alternatives under Advanced. Ideogram defaults to `very_low` quality and high edit precision. OpenAI uses streamed image edits; Fal uses its persistent queue API. Every image starts from the same cached source. Output uploads are 1280 × 720 JPEGs below 2 MB.

The extension uses API keys for text and images. Host permissions are requested for configured providers when you save Settings. Keys never enter Studio's page context or content-script messages. ChatGPT plan sign-in is outside this extension's scope.

Generation costs are paid to your providers. For localization runs, a per-run request limit bounds new submissions, not a currency amount. Pause prevents new paid requests and Studio mutations. Already-submitted work can still finish and incur charges.

## Recovery and privacy

Jobs are stored by channel, video, language and component. IndexedDB holds source hashes, generated text, image assets, provider settings fingerprints, queue receipts, application status and last observed Studio evidence. A service-worker wake advances persisted checkpoints rather than recreating an in-memory queue.

A restarted worker polls a stored Fal receipt. OpenAI image edits have no recoverable queue receipt: an interruption remains ambiguous and requires an explicit retry decision, even when an OpenAI request ID is available. Completed image assets are cached locally and reused. A request interrupted before its receipt was saved becomes **Check provider outcome**. It is never automatically submitted again. Check the provider dashboard before explicitly accepting a possible second charge. Failed application retains generated assets.

Session-only keys are the default. **Remember keys on this device** uses local browser storage, which is not an OS-backed vault. Sensitive Chrome storage is restricted to trusted extension contexts. Keys do not use Chrome Sync and do not appear in exports or logs. Forget them from Settings.

The extension has no telemetry. Titles and descriptions go to your text provider. Source thumbnails go to the selected image provider, OpenAI or Fal. OpenAI streams the image bytes directly; Fal outputs are fetched from its output hosts. No media passes through OpenPost.

Export a backup from Settings before uninstalling. Backups include cached history and image assets, without credentials, account bindings or remote URLs. Imports merge rather than overwrite local work and remove approval and verification authority. Run preflight again after importing.

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
