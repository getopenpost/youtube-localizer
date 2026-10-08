import { z } from 'zod';
import type { FalRequest, Job, ProviderConfig } from '../core/model';
import { falImageModels, type FalImageModel } from '../core/providers';
import { imagePrompt } from './image-prompt';
import { ProviderError, providerJson } from './http';
const receiptSchema = z.object({
  request_id: z.string().min(1),
  status_url: z.string().url(),
  response_url: z.string().url(),
});
const resultSchema = z.object({
  images: z.array(z.object({ url: z.string().url() })).min(1),
});
export function queueUrl(value: string, requestId: string) {
  const url = new URL(value);
  if (
    url.origin !== 'https://queue.fal.run' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.includes(`/requests/${requestId}`)
  )
    throw new ProviderError(
      'Fal returned an unexpected queue URL. Do not resubmit this request.',
      'ambiguous',
    );
  return url.href;
}
export async function submitFalImage(
  model: FalImageModel,
  key: string,
  prompt: string,
  images: string[],
  options: {
    quality: string;
    resolution: '1K' | '2K';
    precision: 'regular' | 'high';
  },
  canSubmit: () => Promise<boolean> = async () => true,
): Promise<FalRequest> {
  if (!key)
    throw new ProviderError('Add a Fal API key in Settings.', 'rejected');
  const endpoint = images.length ? model : falImageModels[model].generation;
  let body: Record<string, unknown> = { prompt, num_images: 1 };
  if (model.startsWith('openai/')) {
    body = {
      ...body,
      quality: options.quality,
      image_size: { width: 1280, height: 720 },
      output_format: 'png',
      ...(images.length ? { image_urls: images } : {}),
    };
  } else if (model === 'ideogram/v4.5/edit') {
    if (images.length > 5)
      throw new ProviderError(
        'Ideogram accepts up to five reference images. Select fewer images.',
        'rejected',
      );
    body = {
      ...body,
      quality: options.quality,
      image_size: images.length ? 'auto' : 'landscape_16_9',
      ...(images.length
        ? {
            image_url: images[0],
            reference_image_urls: images.slice(1),
            edit_precision: options.precision,
          }
        : {}),
    };
  } else {
    body = {
      ...body,
      output_format: 'png',
      aspect_ratio: '16:9',
      ...(images.length ? { image_urls: images } : {}),
      ...(model.includes('-pro') ? { resolution: options.resolution } : {}),
    };
  }
  const encoded = JSON.stringify(body);
  if (!(await canSubmit()))
    throw new ProviderError('Generation paused before submission.', 'rejected');
  const parsed = receiptSchema.safeParse(
    await providerJson(
      `https://queue.fal.run/${endpoint}`,
      {
        method: 'POST',
        headers: {
          authorization: `Key ${key}`,
          'content-type': 'application/json',
        },
        body: encoded,
      },
      true,
    ),
  );
  if (!parsed.success)
    throw new ProviderError(
      'Fal did not return a readable request receipt. Check its dashboard before retrying.',
      'ambiguous',
    );
  return {
    requestId: parsed.data.request_id,
    model: endpoint,
    statusUrl: queueUrl(parsed.data.status_url, parsed.data.request_id),
    responseUrl: queueUrl(parsed.data.response_url, parsed.data.request_id),
  };
}
export async function submitImage(
  job: Job,
  config: ProviderConfig,
  key: string,
  image: string,
  canSubmit?: () => Promise<boolean>,
): Promise<FalRequest> {
  return submitFalImage(
    config.falModel,
    key,
    imagePrompt(job),
    [image],
    {
      quality:
        config.falModel === 'ideogram/v4.5/edit'
          ? config.ideogramQuality
          : config.imageQuality,
      precision: config.ideogramPrecision,
      resolution: config.imageResolution,
    },
    canSubmit,
  );
}
export async function pollImage(
  request: FalRequest,
  key: string,
): Promise<string | undefined> {
  const payload = await pollQueue(request, key);
  if (!payload) return;
  const result = resultSchema.parse(payload);
  const url = new URL(result.images[0].url);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !(
      url.hostname.endsWith('.fal.media') ||
      url.hostname === 'fal.media' ||
      url.hostname === 'storage.googleapis.com'
    )
  )
    throw new ProviderError(
      'Fal returned an unrecognized asset host. Download it from your Fal dashboard.',
      'rejected',
    );
  return url.href;
}

export async function pollQueue(
  request: FalRequest,
  key: string,
): Promise<unknown | undefined> {
  const headers = { authorization: `Key ${key}` };
  const value = z
    .object({ status: z.enum(['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED']) })
    .parse(
      await providerJson(queueUrl(request.statusUrl, request.requestId), {
        headers,
      }),
    );
  return value.status === 'COMPLETED'
    ? providerJson(queueUrl(request.responseUrl, request.requestId), {
        headers,
      })
    : undefined;
}
export async function submitLayerize(
  key: string,
  image: string,
): Promise<FalRequest> {
  if (!key)
    throw new ProviderError('Add your Fal key in Settings.', 'rejected');
  const model = 'fal-ai/ideogram/v3/layerize-text';
  const receipt = receiptSchema.parse(
    await providerJson(
      `https://queue.fal.run/${model}`,
      {
        method: 'POST',
        headers: {
          authorization: `Key ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ image_url: image }),
      },
      true,
    ),
  );
  return {
    requestId: receipt.request_id,
    model,
    statusUrl: queueUrl(receipt.status_url, receipt.request_id),
    responseUrl: queueUrl(receipt.response_url, receipt.request_id),
  };
}
