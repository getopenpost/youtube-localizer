# Live scheduled-video pilot

This gate requires an owner-selected scheduled test video and provider keys configured locally in the extension. Do not use real creator content or paid provider credentials through a test harness.

## Before generating

Record the channel, video, source title, description, declared language, visibility and exact scheduled publication timestamp. Read the current Studio thumbnail using the authenticated URL. Inspect its dimensions. Use a larger source image if necessary. Check at least one already-present localization and one missing language. Unknown fields must stop generation and writes.

## Generation and review

Generate one missing title and description. For the thumbnail, read or enter source text once, correct it, translate the wording, approve exact replacement strings and generate from the same source image. Record the Fal request ID and provider submission count. Confirm there is no image request when the source has no text.

Pause after a Fal receipt has been persisted. Restart Chrome, restore keys if session-only, and resume. Verify the same request ID is polled and the provider dashboard has no duplicate submission. A restart before receipt persistence must show an ambiguous outcome and require an explicit retry decision.

## Apply and verify

Approve one language's missing components. Keep the dedicated Studio working tab visible. Apply them, then reopen the language dialog and check the exact title and description. Visually inspect the saved thumbnail. A positive image row alone does not establish which processed image Studio saved.

Confirm the source title and description, visibility and publication timestamp remain exactly unchanged. Re-run preflight and verify that existing manual translations remain intact. Interrupt an upload and verify that retrying application reuses the generated image rather than calling Fal again.

## Failure boundaries

Switch accounts or channels in the working tab. Application must pause. Open an unexpected dialog. Application must stop. Make a manual translation after preflight. It must be preserved at application. Change the source title or thumbnail after generation. The affected component must become stale and cannot be applied blindly.

## Required evidence

Keep before/after screenshots of the schedule and language dialogs, provider dashboard submission counts, the persisted Fal request ID, and the extension's resulting statuses. Do not include API keys, signed media URLs or private creator data in the public repository.

Only record a live pass after completing the entire gate. Local fixtures are separate evidence.

## Additional provider and account checks

Connect two Studio accounts in separate tabs. Give them different target languages and switch between them. Verify preflight, application and verification links retain the observed account selector. Switch the account in a bound working tab during a batch and confirm no subsequent write occurs.

Run one GPT Image 2.5 Sunburst streamed edit and one Ideogram 4.5 Edit at very_low quality with high precision. Confirm model names and counts in each provider dashboard. Interrupt a streamed OpenAI request and confirm it is ambiguous rather than automatically repeated.

Run one Layerize preparation on a real thumbnail. Compare the clean background and extracted layout, correct boxes and approve. Enter German and Arabic wording manually and render locally. Confirm no further image or text request occurs. Restart Chrome, restore keys if needed, and reuse the cached template. Change layout and confirm old images cannot be approved or applied until rendered again. Check decorative lettering and a long translation; correct the layout instead of silently clipping. Export/import a backup and verify the template is present but unapproved.
