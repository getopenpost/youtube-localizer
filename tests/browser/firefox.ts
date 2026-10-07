import { firefox } from '@playwright/test';
import net from 'node:net';
import { resolve } from 'node:path';
export const FIREFOX_UUID = 'a889ed51-f48f-4c4f-9d52-6fa02db6b4e3';
interface Target {
  url: string;
  consoleActor: string;
}
interface Packet {
  from?: string;
  type?: string;
  error?: string;
  message?: string;
  resultID?: string;
  result?: unknown;
  exception?: unknown;
  exceptionMessage?: string;
  hasException?: boolean;
  topLevelAwaitRejected?: boolean;
  addonsActor?: string;
  actor?: string;
  addons?: { id: string; actor: string }[];
  target?: Target;
}
// Firefox's public RDP installs and inspects native extension pages that
// Playwright cannot attach. Test profiles never use real accounts or keys.
async function connect(port: number) {
  const socket = net.connect(port, '127.0.0.1');
  let incoming = Buffer.alloc(0);
  let waiting:
    | {
        actor: string;
        resolve: (packet: Packet) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  const events: Packet[] = [];
  const eventWaiters: {
    predicate: (packet: Packet) => boolean;
    resolve: (packet: Packet) => void;
  }[] = [];
  const response = (actor: string) =>
    new Promise<Packet>((resolve, reject) => {
      waiting = { actor, resolve, reject };
    });
  const hello = response('root');
  socket.setTimeout(45000, () =>
    socket.destroy(new Error('Firefox debugger timed out')),
  );
  socket.on('error', (error) => waiting?.reject(error));
  socket.on('data', (chunk) => {
    incoming = Buffer.concat([
      incoming,
      typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
    ]);
    while (true) {
      const colon = incoming.indexOf(':');
      if (colon < 0) return;
      const length = Number(incoming.subarray(0, colon).toString());
      if (incoming.length < colon + 1 + length) return;
      const packet = JSON.parse(
        incoming.subarray(colon + 1, colon + 1 + length).toString(),
      ) as Packet;
      incoming = incoming.subarray(colon + 1 + length);
      if (packet.type) {
        const index = eventWaiters.findIndex((w) => w.predicate(packet));
        if (index >= 0) eventWaiters.splice(index, 1)[0].resolve(packet);
        else events.push(packet);
      } else if (waiting && packet.from === waiting.actor) {
        const current = waiting;
        waiting = undefined;
        if (packet.error)
          current.reject(new Error(String(packet.message ?? packet.error)));
        else current.resolve(packet);
      }
    }
  });
  await hello;
  async function request(
    actor: string,
    type: string,
    values: Record<string, unknown> = {},
  ) {
    const reply = response(actor);
    const body = JSON.stringify({ to: actor, type, ...values });
    socket.write(`${Buffer.byteLength(body)}:${body}`);
    return reply;
  }
  function event(predicate: (packet: Packet) => boolean) {
    const index = events.findIndex(predicate);
    if (index >= 0) return Promise.resolve(events.splice(index, 1)[0]);
    return new Promise<Packet>((resolve) =>
      eventWaiters.push({ predicate, resolve }),
    );
  }
  async function evaluate(consoleActor: string, text: string) {
    const { resultID } = await request(consoleActor, 'evaluateJSAsync', {
      text,
      mapped: { await: true },
    });
    const reply = await event(
      (p) => p.type === 'evaluationResult' && p.resultID === resultID,
    );
    if (reply.hasException || reply.topLevelAwaitRejected)
      throw new Error(
        String(reply.exceptionMessage ?? 'Firefox evaluation rejected'),
      );
    if (reply.exception)
      throw new Error('Firefox exception: ' + JSON.stringify(reply));
    return reply.result;
  }
  return { request, event, evaluate, close: () => socket.destroy() };
}
export async function launchFirefox(profile: string, addonPath: string) {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No debugger port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const context = await firefox.launchPersistentContext(profile, {
    headless: true,
    args: ['-start-debugger-server', String(address.port)],
    firefoxUserPrefs: {
      'devtools.debugger.remote-enabled': true,
      'devtools.debugger.prompt-connection': false,
      'extensions.webextensions.uuids': JSON.stringify({
        'youtube-localizer@getopenpost.org': FIREFOX_UUID,
      }),
    },
  });
  const debuggerApi = await connect(address.port);
  try {
    const root = await debuggerApi.request('root', 'getRoot');
    await debuggerApi.request(root.addonsActor!, 'installTemporaryAddon', {
      addonPath: resolve(addonPath),
    });
    const { addons } = await debuggerApi.request('root', 'listAddons');
    const addon = addons!.find(
      (entry) => entry.id === 'youtube-localizer@getopenpost.org',
    );
    const watcher = await debuggerApi.request(addon!.actor, 'getWatcher', {
      isServerTargetSwitchingEnabled: true,
    });
    await debuggerApi.request(watcher.actor!, 'watchTargets', {
      targetType: 'frame',
    });
    async function target(page: string) {
      return (
        await debuggerApi.event(
          (p) =>
            p.type === 'target-available-form' &&
            !!p.target?.url.endsWith('/' + page),
        )
      ).target!;
    }
    const background = await target('background-firefox.html');
    return { context, debuggerApi, background, target };
  } catch (error) {
    debuggerApi.close();
    await context.close();
    throw error;
  }
}
