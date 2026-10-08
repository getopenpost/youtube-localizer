# Chrome Store releases

Pushing a `v<version>` tag runs `.github/workflows/chrome-release.yml`. It checks the code and browsers, packages the Chromium extension, uploads it to the existing store item, and submits `DEFAULT_PUBLISH`. Google publishes the update when review passes. Run the workflow manually from a release tag to repeat the same process.

## One-time setup

1. Create this extension's item in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), upload its Chromium ZIP, and complete its listing, privacy fields and first submission. The API updates existing items; it cannot create a listing.
2. Enable the Chrome Web Store API in a Google Cloud project and create a service account. In the Developer Dashboard, open **Account** and add that service account's email. Google currently allows one linked service account per publisher; use it for both OpenPost extensions.
3. In this GitHub repository, create the `chrome-store` environment under **Settings → Environments**. Add the configuration below.

| Type     | Name                      | Value                                                                              |
| -------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Variable | `CWS_PUBLISHER_ID`        | Publisher ID from the Developer Dashboard's **Publisher → Settings**, not an email |
| Variable | `CWS_EXTENSION_ID`        | This extension's 32-letter store item ID                                           |
| Secret   | `CWS_SERVICE_ACCOUNT_KEY` | Complete JSON key for the linked service account                                   |

The standard Google authentication action creates an Application Default Credentials file for the official API client and removes it after the job. Authentication runs after packaging, so the key file cannot enter the extension or source ZIP. Never commit a key file.

For GitHub OIDC authentication instead of a stored JSON key, leave `CWS_SERVICE_ACCOUNT_KEY` unset and add both variables below. Follow [Google's Workload Identity Federation setup](https://github.com/google-github-actions/auth#setup) and restrict the provider to this GitHub repository and release refs. Grant that identity `roles/iam.workloadIdentityUser` on the publisher-linked service account.

| Variable                         | Value                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `CWS_WORKLOAD_IDENTITY_PROVIDER` | Full `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>` name |
| `CWS_SERVICE_ACCOUNT`            | Email of the service account linked in the Developer Dashboard                                   |

Use one authentication method. The account owning the publisher must link the service account and finish the initial store listing. Google Cloud and GitHub setup require admin access to those projects and repositories.

## Release an update

1. Increase `package.json` and the source manifest version together.
2. Commit, push, and tag that commit with the same version, for example `v0.7.0`.
3. Push the tag. The workflow requires the tag, package version and packaged MV3 manifest version to agree.

The workflow keeps the ZIP as an artifact and prints the upload state, submission state and current published/submitted revisions. Its job summary links the store item. A successful submission can still be pending review.

Only upload-status reads repeat while Google processes the ZIP, for up to five minutes. Upload and publish requests have retries disabled. After a timeout or an uncertain response, check the Developer Dashboard before running the workflow again. A returned `IN_PROGRESS` state means processing continues; it does not authorize a second upload.

## Sources

- [Service-account setup](https://developer.chrome.com/docs/webstore/service-accounts)
- [API setup and publisher ID](https://developer.chrome.com/docs/webstore/using-api)
- [Upload a package](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload)
- [Upload states](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/UploadState)
- [Submit for publication](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)
- [Fetch current status](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)
- [Official Node API client](https://github.com/googleapis/google-api-nodejs-client)
