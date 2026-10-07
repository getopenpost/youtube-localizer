export class ProviderError extends Error {
  constructor(
    message: string,
    readonly outcome: 'rejected' | 'ambiguous',
  ) {
    super(message);
  }
}
export async function providerJson(
  url: string,
  init: RequestInit,
  paid = false,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(22000),
    });
  } catch {
    throw new ProviderError(
      paid
        ? 'No receipt was received. The provider may have charged for this request. Check its dashboard before retrying.'
        : 'Could not reach the provider. Retry retrieving the existing result.',
      paid ? 'ambiguous' : 'rejected',
    );
  }
  if (!response.ok) {
    // Never echo a provider body: proxies may reflect credentials in errors.
    const ambiguous =
      paid && (response.status >= 500 || response.status === 408);
    throw new ProviderError(
      `Provider returned HTTP ${response.status}. ${ambiguous ? 'The result is uncertain. Check the provider dashboard before retrying.' : 'Check the provider configuration or quota.'}`,
      ambiguous ? 'ambiguous' : 'rejected',
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError(
      'The provider response was unreadable. Check its dashboard before retrying.',
      paid ? 'ambiguous' : 'rejected',
    );
  }
}
