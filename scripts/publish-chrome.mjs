import { readFile, appendFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromewebstore, auth } from '@googleapis/chromewebstore';
import { unzipSync, strFromU8 } from 'fflate';

const UPLOAD_POLLS = 60;
const POLL_INTERVAL_MS = 5_000;
const API_TIMEOUT_MS = 60_000;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name}. See docs/chrome-release.md.`);
  return value;
}

async function main() {
  const publisher = required('CWS_PUBLISHER_ID');
  const item = required('CWS_EXTENSION_ID');
  if (!/^[a-zA-Z0-9_-]+$/.test(publisher) || !/^[a-p]{32}$/.test(item))
    throw new Error('Invalid Chrome Web Store publisher or extension ID.');
  const archive = process.argv[2];
  if (!archive)
    throw new Error('Usage: node scripts/publish-chrome.mjs <Chromium ZIP>');
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const zip = await readFile(archive);
  const files = unzipSync(zip, {
    filter: (entry) => entry.name === 'manifest.json',
  });
  if (!files['manifest.json'])
    throw new Error('The ZIP must contain manifest.json at its root.');
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  if (manifest.version !== version || manifest.manifest_version !== 3)
    throw new Error(
      'The packaged manifest must be MV3 and match package.json version.',
    );
  if (manifest.browser_specific_settings || manifest.background?.page)
    throw new Error(
      'The Chrome release must use the Chromium package, not Firefox.',
    );

  const api = chromewebstore({
    version: 'v2',
    auth: new auth.GoogleAuth({ scopes: [SCOPE] }),
    retry: false,
    timeout: API_TIMEOUT_MS,
  });
  const name = `publishers/${publisher}/items/${item}`;
  const { data: upload } = await api.media.upload({
    name,
    media: { mimeType: 'application/zip', body: zip },
  });
  console.log(`Upload ${version}: ${upload.uploadState}`);
  if (upload.crxVersion && upload.crxVersion !== version)
    throw new Error(
      'Chrome reported a different uploaded version. Publishing stopped.',
    );
  let state = upload.uploadState;
  for (
    let attempt = 0;
    ['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(state) &&
    attempt < UPLOAD_POLLS;
    attempt++
  ) {
    await delay(POLL_INTERVAL_MS);
    const { data } = await api.publishers.items.fetchStatus({ name });
    state = data.lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED')
    throw new Error(
      `Upload state is ${state ?? 'unknown'}. Check the Developer Dashboard before retrying.`,
    );

  const { data: submission } = await api.publishers.items.publish({
    name,
    requestBody: { publishType: 'DEFAULT_PUBLISH' },
  });
  console.log(`Submission ${version}: ${submission.state ?? 'accepted'}`);
  if (submission.warningInfo?.warnings?.length)
    console.log(JSON.stringify(submission.warningInfo, null, 2));
  const { data: status } = await api.publishers.items.fetchStatus({ name });
  console.log(
    JSON.stringify(
      {
        itemId: status.itemId,
        published: status.publishedItemRevisionStatus,
        submitted: status.submittedItemRevisionStatus,
        takenDown: status.takenDown,
        warned: status.warned,
      },
      null,
      2,
    ),
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Chrome Web Store\n\nVersion: ${version}\n\nSubmission: ${submission.state ?? 'accepted'}\n\nPublished: ${status.publishedItemRevisionStatus?.state ?? 'none'}\n\nSubmitted: ${status.submittedItemRevisionStatus?.state ?? 'none'}\n\n[Store item](https://chromewebstore.google.com/detail/${item})\n\nGoogle publishes this submission after review.\n`,
    );
  }
}

main().catch((error) => {
  console.error(
    `Chrome release failed: ${error.response?.data?.error?.message ?? error.message}`,
  );
  console.error(
    'Requests are not retried. Check the Developer Dashboard before running another submission.',
  );
  process.exitCode = 1;
});
