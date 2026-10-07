import { extensionApi } from '../platform/webextension';
import { installThumbnailButton } from './thumbnail-button';
import { z } from 'zod';
import { componentSchema } from '../core/model';
import {
  discover,
  readDetails,
  readThumbnailContext,
  readTranslations,
  StudioWriter,
} from './dom';
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('discover') }),
  z.object({
    type: z.literal('thumbnail-context'),
    channelId: z.string(),
    videoId: z.string(),
  }),
  z.object({
    type: z.literal('details'),
    channelId: z.string(),
    videoId: z.string(),
  }),
  z.object({
    type: z.literal('translations'),
    channelId: z.string(),
    videoId: z.string(),
    languages: z.array(z.string()),
  }),
  z.object({
    type: z.literal('read-text'),
    channelId: z.string(),
    videoId: z.string(),
    language: z.string(),
  }),
  z.object({
    type: z.literal('write'),
    channelId: z.string(),
    videoId: z.string(),
    language: z.string(),
    component: componentSchema,
    value: z.string().optional(),
    companionValue: z.string().optional(),
    imageData: z.string().max(3_000_000).optional(),
    expectedSource: z.object({ title: z.string(), description: z.string() }),
    epoch: z.number(),
  }),
]);
const writer = new StudioWriter(async (epoch) => {
  const response = await extensionApi().runtime.sendMessage({
    type: 'writer-active',
    epoch,
  });
  return response?.active === true;
});
extensionApi().runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (sender.id !== extensionApi().runtime.id) return;
    const parsed = commandSchema.safeParse(message);
    if (!parsed.success) return;
    const command = parsed.data;
    const task = async () => {
      switch (command.type) {
        case 'discover':
          return discover();
        case 'thumbnail-context':
          return readThumbnailContext(command.channelId, command.videoId);
        case 'details':
          return readDetails(command.channelId, command.videoId);
        case 'translations':
          return readTranslations(
            command.channelId,
            command.videoId,
            command.languages,
          );
        case 'read-text':
          return writer.readText(
            command.channelId,
            command.videoId,
            command.language,
          );
        case 'write':
          return writer.apply(command);
      }
    };
    void task()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error ? error.message : 'Studio operation failed.',
        }),
      );
    return true;
  },
);

installThumbnailButton();
