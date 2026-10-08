import { z } from 'zod';
export const GPT_IMAGE_SUNBURST = 'openai/gpt-image-2.5/sunburst/edit';
export const GPT_IMAGE_FLARE = 'openai/gpt-image-2.5/flare/edit';
export const falImageModelSchema = z.enum([
  GPT_IMAGE_SUNBURST,
  GPT_IMAGE_FLARE,
  'ideogram/v4.5/edit',
  'fal-ai/nano-banana-pro/edit',
  'fal-ai/nano-banana/edit',
]);
export type FalImageModel = z.infer<typeof falImageModelSchema>;
export const falImageModels = {
  [GPT_IMAGE_SUNBURST]: {
    label: 'GPT Image 2.5 Sunburst',
    generation: 'openai/gpt-image-2.5/sunburst/text-to-image',
  },
  [GPT_IMAGE_FLARE]: {
    label: 'GPT Image 2.5 Flare',
    generation: 'openai/gpt-image-2.5/flare/text-to-image',
  },
  'ideogram/v4.5/edit': {
    label: 'Ideogram 4.5 Edit',
    generation: 'ideogram/v4.5',
  },
  'fal-ai/nano-banana-pro/edit': {
    label: 'Nano Banana Pro',
    generation: 'fal-ai/nano-banana-pro',
  },
  'fal-ai/nano-banana/edit': {
    label: 'Nano Banana',
    generation: 'fal-ai/nano-banana',
  },
} satisfies Record<FalImageModel, { label: string; generation: string }>;
export const imageQualitySchema = z
  .enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
  .default('auto');
export const textProviderPresets = {
  openai: {
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    auth: 'bearer',
  },
  anthropic: {
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-5-5',
    auth: 'bearer',
  },
  openrouter: {
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4.1-mini',
    auth: 'bearer',
  },
} as const;
