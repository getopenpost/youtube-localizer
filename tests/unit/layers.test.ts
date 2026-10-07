import { afterEach, expect, it, vi } from 'vitest';
import { Repository } from '../../src/core/storage';
import { hash } from '../../src/core/model';
import { prepareTemplate } from '../../src/layers/coordinator';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('a pause during source conversion prevents a paid Layerize submission and leaves preparation safely retryable', async () => {
  const repo = new Repository(crypto.randomUUID());
  const blob = new Blob(['image-fixture'], { type: 'image/png' });
  const id = await hash(blob);
  await repo.putAsset({ id, hash: id, blob, width: 1280, height: 720 });
  await repo.putVideo({
    id: 'abcdefghijk',
    channelId: 'UC0000000000000000000000',
    channelName: 'Fixture',
    title: 'Source',
    description: '',
    visibility: 'scheduled',
    thumbnailAssetId: id,
    thumbnailTextApproved: false,
  });
  vi.stubGlobal('chrome', {
    storage: {
      local: { setAccessLevel: async () => {} },
      session: {
        setAccessLevel: async () => {},
        get: async () => ({ credentials: { falKey: 'fixture-key' } }),
      },
    },
  });
  const network = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          request_id: 'saved',
          status_url:
            'https://queue.fal.run/fal-ai/ideogram/requests/saved/status',
          response_url: 'https://queue.fal.run/fal-ai/ideogram/requests/saved',
        }),
      ),
  );
  vi.stubGlobal('fetch', network);
  const read = Blob.prototype.arrayBuffer;
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementationOnce(
    async function (this: Blob) {
      await repo.pause();
      return read.call(this);
    },
  );
  await prepareTemplate(repo, 'abcdefghijk');
  expect(network).not.toHaveBeenCalled();
  expect((await repo.template(id))?.state).toBe('error');
  await prepareTemplate(repo, 'abcdefghijk');
  expect(network).toHaveBeenCalledTimes(1);
  expect((await repo.template(id))?.state).toBe('waiting');
});
