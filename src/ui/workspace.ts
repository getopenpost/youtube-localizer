import type { Reference, Creation } from '../thumbnails/model';
import type { LayerTemplate } from '../layers/model';
import { readable } from 'svelte/store';
import { repository } from '../core/storage';
import {
  defaultRun,
  defaultSettings,
  type Account,
  type Job,
  type Preferences,
  type Run,
  type Settings,
  type Video,
} from '../core/model';
export interface Workspace {
  references: Reference[];
  creations: Creation[];
  accounts: Account[];
  activeChannel: string;
  templates: LayerTemplate[];
  videos: Video[];
  jobs: Job[];
  preferences: Preferences[];
  settings: Settings;
  run: Run;
}
interface Snapshot {
  workspace: Workspace;
  loading: boolean;
  storageError: string;
}
let snapshot: Snapshot = {
  workspace: {
    references: [],
    creations: [],
    accounts: [],
    activeChannel: '',
    templates: [],
    videos: [],
    jobs: [],
    preferences: [],
    settings: defaultSettings(),
    run: defaultRun(),
  },
  loading: true,
  storageError: '',
};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  try {
    const [
      videos,
      jobs,
      preferences,
      settings,
      run,
      templates,
      accounts,
      activeChannel,
      references,
      creations,
    ] = await Promise.all([
      repository.videos(),
      repository.jobs(),
      repository.allPreferences(),
      repository.settings(),
      repository.run(),
      repository.templates(),
      repository.accounts(),
      repository.activeChannel(),
      repository.references(),
      repository.creations(),
    ]);
    snapshot = {
      workspace: {
        videos,
        jobs,
        preferences,
        settings,
        run,
        templates,
        accounts,
        activeChannel,
        references,
        creations,
      },
      loading: false,
      storageError: '',
    };
  } catch {
    snapshot = {
      ...snapshot,
      loading: false,
      storageError:
        'Local storage could not be opened. Reload the extension. Existing work has not been deleted.',
    };
  }
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    void refresh();
    timer = setInterval(() => void refresh(), 1200);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
export const workspaceStore = readable(snapshot, (set) =>
  subscribe(() => set(snapshot)),
);
export { refresh };
