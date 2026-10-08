import { z } from 'zod';
import {
  falImageModelSchema,
  imageQualitySchema,
  GPT_IMAGE_SUNBURST,
  GPT_IMAGE_FLARE,
} from './providers';

// Language identifiers also become archive paths. Accept codes, never arbitrary path strings.
const languageCode = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/);

export const componentSchema = z.enum(['title', 'description', 'thumbnail']);
export type Component = z.infer<typeof componentSchema>;
export const components: Component[] = ['title', 'description', 'thumbnail'];
export const evidenceSchema = z.object({
  state: z.enum(['missing', 'present', 'unknown']),
  value: z.string().max(10000).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const videoSchema = z.object({
  id: z.string().regex(/^[\w-]{11}$/),
  channelId: z.string().regex(/^UC[\w-]{22}$/),
  channelName: z.string(),
  title: z.string().max(100),
  description: z.string().max(5000),
  thumbnailUrl: z.string().optional(),
  thumbnailAssetId: z.string().optional(),
  studioThumbnailHash: z.string().optional(),
  thumbnailOrigin: z.enum(['studio', 'chosen']).optional(),
  extractionStatus: z
    .enum(['submitting', 'generated', 'ambiguous', 'error'])
    .optional(),
  extractedThumbnailText: z.array(z.string()).optional(),
  sourceLanguage: languageCode.optional(),
  visibility: z.enum([
    'published',
    'scheduled',
    'private',
    'unlisted',
    'unknown',
  ]),
  scheduledAt: z.string().optional(),
  sourceHashes: z.record(componentSchema, z.string()).optional(),
  thumbnailText: z.array(z.string().max(200)).optional(),
  thumbnailTextApproved: z.boolean().default(false),
  thumbnailWidth: z.number().optional(),
  thumbnailHeight: z.number().optional(),
  checkedAt: z.number().optional(),
});
export type Video = z.infer<typeof videoSchema>;
export const preferencesSchema = z.object({
  channelId: z.string(),
  sourceLanguage: languageCode.default('pt'),
  targetLanguages: z.array(languageCode).max(50).default(['en', 'es', 'fr']),
  components: z.array(componentSchema).min(1).default(['title', 'description']),
  glossary: z.string().max(6000).default(''),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const providerConfigSchema = z.preprocess(
  (value) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('imageProvider' in value) ||
      value.imageProvider !== 'openai'
    )
      return value;
    const legacy = value as Record<string, unknown>;
    return {
      ...legacy,
      imageProvider: 'fal',
      falModel:
        legacy.imageModel === 'gpt-image-2.5-flare'
          ? GPT_IMAGE_FLARE
          : GPT_IMAGE_SUNBURST,
    };
  },
  z.object({
    protocol: z.enum(['openai', 'anthropic']).default('openai'),
    preset: z
      .enum(['openai', 'anthropic', 'openrouter', 'custom'])
      .default('openai'),
    baseUrl: z.string().url().default('https://api.openai.com/v1'),
    model: z.string().min(1).max(150).default('gpt-4.1-mini'),
    auth: z.enum(['bearer', 'none']).default('bearer'),
    imageProvider: z.enum(['fal', 'layerize']).default('fal'),
    imageQuality: imageQualitySchema,
    vision: z.boolean().default(true),
    falModel: falImageModelSchema.default(GPT_IMAGE_SUNBURST),
    ideogramQuality: z
      .enum(['very_low', 'low', 'medium', 'high'])
      .default('very_low'),
    ideogramPrecision: z.enum(['regular', 'high']).default('high'),
    imageResolution: z.enum(['1K', '2K']).default('1K'),
    requestLimit: z.number().int().min(1).max(1000).default(30),
  }),
);
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export const settingsSchema = z.object({
  provider: providerConfigSchema,
  rememberCredentials: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;
export const generationSchema = z.enum([
  'queued',
  'submitting',
  'waiting',
  'generated',
  'ambiguous',
  'error',
  'not-needed',
]);
export const applicationSchema = z.enum([
  'pending',
  'approved',
  'applying',
  'verified',
  'needs-verification',
  'preserved',
  'stale',
]);
export const slotSchema = z.object({
  sourceHash: z.string(),
  generation: generationSchema,
  application: applicationSchema,
  value: z.string().optional(),
  assetId: z.string().optional(),
  assetHash: z.string().optional(),
  provider: z.string().optional(),
  requestId: z.string().optional(),
  settingsHash: z.string().optional(),
  templateRevision: z.string().optional(),
  error: z.string().optional(),
  verifiedAt: z.number().optional(),
  lastEvidence: evidenceSchema.optional(),
});
export type Slot = z.infer<typeof slotSchema>;
export const falRequestSchema = z.object({
  requestId: z.string().min(1).max(200),
  model: z.string(),
  statusUrl: z.string().url(),
  responseUrl: z.string().url(),
});
export type FalRequest = z.infer<typeof falRequestSchema>;
export const jobSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  videoId: z.string(),
  language: languageCode,
  sourceLanguage: languageCode,
  source: videoSchema,
  glossary: z.string(),
  enabledComponents: z.array(componentSchema).optional(),
  slots: z.object({
    title: slotSchema.optional(),
    description: slotSchema.optional(),
    thumbnail: slotSchema.optional(),
  }),
  thumbnailStrings: z.array(z.string()).optional(),
  wordingApproved: z.boolean().default(false),
  correction: z.string().max(2000).default(''),
  falRequest: falRequestSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Job = z.infer<typeof jobSchema>;
export const accountSchema = z.object({
  channelId: z.string().regex(/^UC[\w-]{22}$/),
  channelName: z.string().max(300),
  authuser: z.string().max(200).optional(),
  tabId: z.number().int().optional(),
});
export type Account = z.infer<typeof accountSchema>;
export const runSchema = z.object({
  mode: z.enum(['paused', 'generate', 'apply']).default('paused'),
  epoch: z.number().default(0),
  requestsUsed: z.number().default(0),
  requestLimit: z.number().default(30),
  jobIds: z.array(z.string()).default([]),
  reason: z.string().default(''),
  workingTabId: z.number().optional(),
  authuser: z.string().optional(),
  channelId: z.string().optional(),
});
export type Run = z.infer<typeof runSchema>;
export interface Asset {
  id: string;
  blob: Blob;
  hash: string;
  width: number;
  height: number;
}
export interface Snapshot {
  video: Video;
  targets: Record<string, Record<Component, Evidence>>;
  languages: string[];
}
export const snapshotSchema = z.object({
  video: videoSchema,
  targets: z.record(
    z.string(),
    z.object({
      title: evidenceSchema,
      description: evidenceSchema,
      thumbnail: evidenceSchema,
    }),
  ),
  languages: z.array(z.string()),
});
export interface StudioContext {
  channelId: string;
  channelName: string;
  videos: Video[];
  scope: 'page' | 'video';
}
export const studioContextSchema = z.object({
  channelId: z.string(),
  channelName: z.string(),
  videos: z.array(videoSchema),
  scope: z.enum(['page', 'video']),
});
export const defaultSettings = (): Settings =>
  settingsSchema.parse({ provider: {} });
export const defaultRun = (): Run => runSchema.parse({});
export const jobId = (channel: string, video: string, language: string) =>
  `${channel}/${video}/${language}`;
export async function hash(value: string | Blob): Promise<string> {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : await value.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function sourceHashes(
  video: Video,
): Promise<Record<Component, string>> {
  return {
    title: await hash(video.title),
    description: await hash(video.description),
    thumbnail:
      video.sourceHashes?.thumbnail ??
      (await hash(video.thumbnailUrl ?? 'unreadable')),
  };
}
