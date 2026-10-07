import { afterEach, expect, it, vi } from 'vitest';
import { Repository } from '../../src/core/storage';
import { creationSchema } from '../../src/thumbnails/model';
import {
  recoverCreations,
  generateThumbnail,
} from '../../src/thumbnails/coordinator';
import { createImage } from '../../src/providers/create-image';
const creation = () =>
  creationSchema.parse({
    id: crypto.randomUUID(),
    video: {
      id: 'abcdefghijk',
      channelId: 'UC0000000000000000000000',
      channelName: 'Fixture',
      title: 'Source',
      description: 'Context',
      visibility: 'scheduled',
    },
    prompt: 'A new thumbnail',
    references: [],
    model: 'gpt-image-2.5-sunburst',
    state: 'submitting',
    createdAt: 1,
  });
afterEach(() => vi.unstubAllGlobals());
it('recovers an interrupted creation as ambiguous and reuses its id without another submission', async () => {
  const repo = new Repository(crypto.randomUUID());
  const value = creation();
  value.requestId = 'saved-openai-request';
  await repo.putCreation(value);
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  await recoverCreations(repo);
  const result = await generateThumbnail(repo, {
    id: value.id,
    videoId: value.video.id,
    prompt: 'Changed caller prompt',
    referenceIds: [],
    useCurrent: false,
    acknowledged: false,
  });
  expect(result.state).toBe('ambiguous');
  expect(result.requestId).toBe('saved-openai-request');
  expect(result.prompt).toBe('A new thumbnail');
  expect(network).not.toHaveBeenCalled();
});
it('rechecks pause after SDK reference serialization and rejects before the paid fetch', async () => {
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  await expect(
    createImage(
      creation(),
      'fixture-key',
      [new Blob(['fixture image'], { type: 'image/png' })],
      async () => {},
      async () => false,
    ),
  ).rejects.toMatchObject({
    outcome: 'rejected',
    message: 'Generation paused before submission.',
  });
  expect(network).not.toHaveBeenCalled();
});
