import { z } from 'zod';
import { falRequestSchema } from '../core/model';
export const layerSchema = z.object({
  id: z.string().max(80),
  text: z.string().max(200),
  x: z.number().finite().min(-10000).max(10000),
  y: z.number().finite().min(-10000).max(10000),
  width: z.number().min(1).max(10000),
  height: z.number().min(1).max(10000),
  fontSize: z.number().min(6).max(1000),
  fontFamily: z
    .enum(['Geist', 'Arial', 'Georgia', 'sans-serif', 'serif'])
    .default('Geist'),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  letterSpacing: z.number().min(-30).max(100).default(0),
  fontWeight: z.number().min(100).max(900).default(600),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffffff'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  rotation: z.number().min(-180).max(180).default(0),
  lineHeight: z.number().min(0.8).max(3).default(1.2),
  strokeWidth: z.number().min(0).max(20).default(0),
  strokeColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#000000'),
});
export type TextLayer = z.infer<typeof layerSchema>;
export const templateSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  sourceHash: z.string(),
  state: z.enum(['submitting', 'waiting', 'ready', 'ambiguous', 'error']),
  request: falRequestSchema.optional(),
  backgroundAssetId: z.string().optional(),
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
  layers: z.array(layerSchema).max(30).default([]),
  approved: z.boolean().default(false),
  revision: z.string().default(''),
  error: z.string().optional(),
});
export type LayerTemplate = z.infer<typeof templateSchema>;
