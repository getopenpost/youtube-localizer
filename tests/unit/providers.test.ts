import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Job } from '../../src/core/model';
import { translate } from '../../src/providers/text';
import { pollImage, submitImage } from '../../src/providers/fal';
import { providerBase } from '../../src/platform/credentials';
import { providerJson } from '../../src/providers/http';
const job: Job = {
  id: 'channel/video/en',
  channelId: 'channel',
  videoId: 'video',
  language: 'en',
  sourceLanguage: 'pt',
  source: {
    id: 'abcdefghijk',
    channelId: 'UC0000000000000000000000',
    channelName: 'Teacher',
    title: 'Aprender',
    description: '00:00 Introdução',
    visibility: 'scheduled',
    thumbnailText: ['APRENDER'],
    thumbnailTextApproved: true,
  },
  glossary: 'OpenPost',
  slots: {},
  thumbnailStrings: ['LEARN'],
  wordingApproved: true,
  correction: '',
  createdAt: 0,
  updatedAt: 0,
};
afterEach(() => vi.unstubAllGlobals());
describe('provider protocols and credential boundary', () => {
  it.each(['openai', 'anthropic'] as const)(
    'parses %s translations and sends credentials only to the configured provider',
    async (protocol) => {
      const config = {
        ...defaultSettings().provider,
        protocol,
        baseUrl:
          protocol === 'openai'
            ? 'https://api.openai.com/v1'
            : 'https://api.anthropic.com/v1',
      };
      const content = JSON.stringify({
        title: 'Learn',
        description: '00:00 Introduction',
        thumbnailStrings: ['LEARN'],
      });
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              protocol === 'openai'
                ? { choices: [{ message: { content } }] }
                : { content: [{ type: 'text', text: content }] },
            ),
            { headers: { 'content-type': 'application/json' } },
          ),
      );
      vi.stubGlobal('fetch', fetch);
      expect(await translate(job, config, 'fixture-key')).toEqual({
        title: 'Learn',
        description: '00:00 Introduction',
        thumbnailStrings: ['LEARN'],
      });
      const [url, init] = fetch.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(
        protocol === 'openai'
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://api.anthropic.com/v1/messages',
      );
      expect(
        new Headers(init.headers).get(
          protocol === 'openai' ? 'authorization' : 'x-api-key',
        ),
      ).toBe(protocol === 'openai' ? 'Bearer fixture-key' : 'fixture-key');
      expect(init.redirect).toBe('error');
      expect(init.credentials).toBe('omit');
    },
  );
  it('rejects provider output outside independent YouTube title limits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      title: 'x'.repeat(101),
                      description: '',
                      thumbnailStrings: ['LEARN'],
                    }),
                  },
                },
              ],
            }),
          ),
      ),
    );
    await expect(
      translate(job, defaultSettings().provider, 'key'),
    ).rejects.toMatchObject({ outcome: 'ambiguous' });
  });
  it('uses exact approved strings and validates a Fal receipt before polling', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            request_id: 'request-1',
            status_url:
              'https://queue.fal.run/fal-ai/nano-banana-pro/requests/request-1/status',
            response_url:
              'https://queue.fal.run/fal-ai/nano-banana-pro/requests/request-1',
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const receipt = await submitImage(
      job,
      defaultSettings().provider,
      'fixture-fal',
      'data:image/jpeg;base64,fixture',
    );
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.image_urls).toEqual(['data:image/jpeg;base64,fixture']);
    expect(payload.prompt).toContain('"from":"APRENDER","to":"LEARN"');
    expect(receipt.requestId).toBe('request-1');
    await expect(
      pollImage(
        {
          ...receipt,
          statusUrl: 'https://attacker.example/requests/request-1/status',
        },
        'fixture-fal',
      ),
    ).rejects.toThrow('unexpected queue URL');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not echo provider bodies or follow redirects with an API key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('secret-fixture-key', { status: 500 })),
    );
    await expect(
      providerJson(
        'https://provider.example',
        { headers: { authorization: 'secret-fixture-key' } },
        true,
      ),
    ).rejects.toMatchObject({
      outcome: 'ambiguous',
      message: expect.not.stringContaining('secret-fixture-key'),
    });
  });
  it('rejects untrusted URL credentials and remote cleartext endpoints', () => {
    for (const url of [
      'http://provider.example/v1',
      'https://key:secret@provider.example/v1',
      'https://provider.example/v1?key=secret',
    ])
      expect(() => providerBase(url)).toThrow();
    expect(providerBase('http://localhost:8080/v1/')).toBe(
      'http://localhost:8080/v1',
    );
  });
});
