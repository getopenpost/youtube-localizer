import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  defaultRun,
  defaultSettings,
  type Asset,
  type Job,
  type Run,
  type Settings,
  type Video,
  type Preferences,
} from './model';
interface LocalizerDB extends DBSchema {
  videos: { key: string; value: Video };
  jobs: { key: string; value: Job };
  assets: { key: string; value: Asset };
  meta: { key: string; value: Run | Settings | Preferences };
}
export class Repository {
  private database?: Promise<IDBPDatabase<LocalizerDB>>;
  constructor(private readonly name = 'youtube-localizer') {}
  private db() {
    this.database ??= openDB<LocalizerDB>(this.name, 1, {
      upgrade(db) {
        db.createObjectStore('videos', { keyPath: 'id' });
        db.createObjectStore('jobs', { keyPath: 'id' });
        db.createObjectStore('assets', { keyPath: 'id' });
        db.createObjectStore('meta');
      },
    });
    return this.database;
  }
  async videos() {
    return (await this.db()).getAll('videos');
  }
  async video(id: string) {
    return (await this.db()).get('videos', id);
  }
  async putVideo(video: Video) {
    await (await this.db()).put('videos', video);
  }
  async jobs() {
    return (await this.db()).getAll('jobs');
  }
  async job(id: string) {
    return (await this.db()).get('jobs', id);
  }
  async putJob(job: Job) {
    job.updatedAt = Date.now();
    await (await this.db()).put('jobs', job);
  }
  async assets() {
    return (await this.db()).getAll('assets');
  }
  async asset(id: string) {
    return (await this.db()).get('assets', id);
  }
  async putAsset(asset: Asset) {
    await (await this.db()).put('assets', asset);
  }
  async run(): Promise<Run> {
    return (
      ((await (await this.db()).get('meta', 'run')) as Run) ?? defaultRun()
    );
  }
  async putRun(run: Run) {
    await (await this.db()).put('meta', run, 'run');
  }
  async settings(): Promise<Settings> {
    return (
      ((await (await this.db()).get('meta', 'settings')) as Settings) ??
      defaultSettings()
    );
  }
  async putSettings(settings: Settings) {
    await (await this.db()).put('meta', settings, 'settings');
  }
  async preferences(channel: string): Promise<Preferences | undefined> {
    return (await (await this.db()).get('meta', `channel:${channel}`)) as
      Preferences | undefined;
  }
  async allPreferences(): Promise<Preferences[]> {
    const db = await this.db();
    const keys = await db.getAllKeys('meta');
    const values = await db.getAll('meta');
    return values.filter((_, i) =>
      keys[i].startsWith('channel:'),
    ) as Preferences[];
  }
  async putPreferences(value: Preferences) {
    await (await this.db()).put('meta', value, `channel:${value.channelId}`);
  }
  async pause(reason = 'Paused. Submitted requests can still incur charges.') {
    const db = await this.db();
    const tx = db.transaction('meta', 'readwrite');
    const run = ((await tx.store.get('run')) as Run) ?? defaultRun();
    run.mode = 'paused';
    run.epoch++;
    run.reason = reason;
    await tx.store.put(run, 'run');
    await tx.done;
  }
  async consumeRequest(epoch: number) {
    const db = await this.db();
    const tx = db.transaction('meta', 'readwrite');
    const run = ((await tx.store.get('run')) as Run) ?? defaultRun();
    if (run.mode !== 'generate' || run.epoch !== epoch) {
      await tx.done;
      throw new Error('Generation paused.');
    }
    if (run.requestsUsed >= run.requestLimit) {
      await tx.done;
      throw new Error(
        'Request limit reached. Raise the limit and start generation again to continue.',
      );
    }
    run.requestsUsed++;
    await tx.store.put(run, 'run');
    await tx.done;
  }
  async isActive(epoch: number, mode: Run['mode']) {
    const run = await this.run();
    return run.epoch === epoch && run.mode === mode;
  }
  async importCache(data: {
    videos: Video[];
    jobs: Job[];
    assets: Asset[];
    preferences: Preferences[];
  }) {
    const db = await this.db();
    const tx = db.transaction(
      ['videos', 'jobs', 'assets', 'meta'],
      'readwrite',
    );
    for (const video of data.videos)
      if (!(await tx.objectStore('videos').get(video.id)))
        await tx.objectStore('videos').put(video);
    for (const job of data.jobs)
      if (!(await tx.objectStore('jobs').get(job.id)))
        await tx.objectStore('jobs').put(job);
    for (const asset of data.assets)
      if (!(await tx.objectStore('assets').get(asset.id)))
        await tx.objectStore('assets').put(asset);
    for (const pref of data.preferences)
      if (!(await tx.objectStore('meta').get(`channel:${pref.channelId}`)))
        await tx.objectStore('meta').put(pref, `channel:${pref.channelId}`);
    await tx.done;
  }
}
export const repository = new Repository();
