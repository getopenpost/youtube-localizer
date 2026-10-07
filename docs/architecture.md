# Architecture

The content script reads the Studio DOM and performs allowlisted language-dialog operations. It has no provider credentials, arbitrary page bridge or network-generation API.

Extension pages send validated commands to a service worker. The worker verifies the sender is one of the packaged UI pages. Studio content messages can only check whether the current writer epoch is active. There are no externally connectable messages or web-accessible extension resources.

The coordinator owns a single Web Lock across discovery, preflight, generation and application. Pause updates a separate durable epoch without waiting for that lock. Before paid requests and each DOM mutation, the run must still have the same epoch and mode. Worker initialization recovers interrupted submission and application states under the same lock.

Chrome alarms wake the runner. Each persisted operation advances one generation or application. The worker continues while work can proceed and yields when queued Fal results need a later poll. OpenAI image edits use the official SDK with automatic retries disabled; the worker stays alive for the active stream, records the request ID and caches the final image. An interrupted OpenAI edit is ambiguous and is never automatically repeated. Requests save submitting state before the network call. Fal receipts are saved before a later tick polls. A network error or unreadable paid response remains ambiguous unless an explicit rejection establishes that no result was accepted. Provider response bodies are not echoed into errors.

Generated components retain source hashes and their provider/model/settings fingerprint. A fresh preflight is the authority for missingness. Generated output, local history and imported approvals never establish Studio state by themselves. Existing content and unreadable targets are preserved. Studio source and visibility checks happen before and after application.

Images use content hashes as asset IDs. Current Studio thumbnails are fetched through narrow ytimg host permissions. Provider fetches omit ambient cookies and reject redirects. Fal queue URLs must stay on queue.fal.run and refer to the received request ID. Fal output fetches accept only its output-host allowlist and carry no Fal key.

Backups contain validated, bounded manifests and content-hashed local blobs. They exclude credentials, provider settings, account bindings and remote URLs. Import strips approval and verification state, verifies asset hashes, rejects mismatched channel/video identities and unsafe language identifiers, and merges only absent records.

No remotely downloaded logic, action interpreter, backend, OAuth flow or analytics is part of this extension.

## Account binding

Discovery records a channel ID, name, observed authuser selector and Studio tab ID in local metadata. Active selection is independent of run state. Preferences and jobs remain keyed by channel ID. Preflight binds a verified tab and observed selector to the run; navigation and writer authorization recheck them. Only a closed tab can be replaced automatically. An existing tab with an unreadable or changed account stops work. Imported history cannot establish an account binding.

## Reusable text layouts

Layerize preparation is keyed by the cached source hash. Save submitting before POST and recheck the durable pause epoch after converting the source bytes. Persist the queue receipt before retrieval. A restart retrieves that receipt; an interrupted submission without a receipt requires explicit charge acknowledgment.

A bundled offscreen document sanitizes provider overlay HTML with DOMPurify, accepts only bounded layout styles and packaged fonts, then measures editable boxes. It never loads provider HTML scripts, images, stylesheets or remote fonts. If parsing fails, keep the downloaded background and let the user add boxes. The canvas renderer consumes cached background bytes and validated text layers, never provider URLs. Local renders do not consume the paid request counter, and an interrupted local render is safely requeued.

Rendered slots record their template revision. Approval and Studio application require that revision to match the current approved template, even if a worker stopped between template persistence and dependent job invalidation. Recovery marks obsolete local images stale. Approved manual words survive unrelated text generation.
