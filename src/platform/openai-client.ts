import OpenAI from 'openai';
import { ProviderError } from '../providers/http';
export function openaiClient(key: string) {
  if (!key)
    throw new ProviderError('Add an OpenAI API key in Settings.', 'rejected');
  return new OpenAI({
    apiKey: key,
    baseURL: 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
    timeout: 600000,
    logLevel: 'off',
  });
}
export async function activeRequest<T>(task: () => Promise<T>): Promise<T> {
  // Image streams can be quiet while inference runs. Keep the worker alive only for this active operation.
  const timer =
    typeof chrome !== 'undefined' && chrome.runtime?.id
      ? setInterval(
          () => void chrome.runtime.getPlatformInfo().catch(() => {}),
          20000,
        )
      : undefined;
  try {
    return await task();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const status = error instanceof OpenAI.APIError ? error.status : undefined;
    throw new ProviderError(
      status
        ? `OpenAI returned HTTP ${status}.`
        : 'OpenAI request interrupted. Check its outcome before retrying.',
      status && status < 500 && status !== 408 ? 'rejected' : 'ambiguous',
    );
  } finally {
    if (timer) clearInterval(timer);
  }
}
