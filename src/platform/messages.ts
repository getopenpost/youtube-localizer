import { extensionApi } from './webextension';
import { referenceSchema, MAX_REFERENCES } from '../thumbnails/model';
import { layerSchema } from '../layers/model';
import { z } from 'zod';
import {
  componentSchema,
  preferencesSchema,
  settingsSchema,
} from '../core/model';
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reference-save'), reference: referenceSchema }),
  z.object({ type: z.literal('reference-remove'), id: z.string().uuid() }),
  z.object({
    type: z.literal('thumbnail-generate'),
    id: z.string().uuid(),
    videoId: z.string().regex(/^[\w-]{11}$/),
    prompt: z.string().trim().min(1).max(6000),
    referenceIds: z.array(z.string().uuid()).max(MAX_REFERENCES),
    useCurrent: z.boolean(),
    acknowledged: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('prepare-template'),
    videoId: z.string(),
    acknowledged: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('save-template'),
    id: z.string(),
    layers: z.array(layerSchema).max(30),
    approved: z.boolean(),
  }),
  z.object({ type: z.literal('retry-template'), id: z.string() }),
  z.object({ type: z.literal('discover'), channelId: z.string().optional() }),
  z.object({ type: z.literal('select-channel'), channelId: z.string() }),
  z.object({
    type: z.literal('preflight'),
    channelId: z.string(),
    videoIds: z.array(z.string()).min(1).max(30),
  }),
  z.object({ type: z.literal('generate'), jobIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('apply'), jobIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('settings'), settings: settingsSchema }),
  z.object({ type: z.literal('preferences'), preferences: preferencesSchema }),
  z.object({
    type: z.literal('edit'),
    jobId: z.string(),
    component: componentSchema,
    value: z.string().max(5000),
  }),
  z.object({
    type: z.literal('approve'),
    jobId: z.string(),
    component: componentSchema,
    approved: z.boolean(),
  }),
  z.object({
    type: z.literal('wording'),
    jobId: z.string(),
    strings: z.array(z.string().max(200)).max(30),
    approved: z.boolean(),
  }),
  z.object({
    type: z.literal('source-text'),
    videoId: z.string(),
    strings: z.array(z.string().max(200)).max(30),
  }),
  z.object({ type: z.literal('extract-text'), videoId: z.string() }),
  z.object({
    type: z.literal('source-image'),
    videoId: z.string(),
    assetId: z.string(),
  }),
  z.object({
    type: z.literal('retry'),
    jobId: z.string(),
    component: componentSchema,
    acknowledged: z.boolean(),
  }),
  z.object({
    type: z.literal('regenerate-text'),
    jobId: z.string(),
    component: z.enum(['title', 'description']),
  }),
  z.object({
    type: z.literal('regenerate-image'),
    jobId: z.string(),
    correction: z.string().max(2000),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export async function command<T = unknown>(value: Command): Promise<T> {
  const result = await extensionApi().runtime.sendMessage(value);
  if (!result?.ok)
    throw new Error(
      result?.error ?? 'The extension did not respond. Reload it and retry.',
    );
  return result.data as T;
}
