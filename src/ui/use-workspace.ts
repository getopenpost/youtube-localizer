import { useSyncExternalStore } from 'react';
import { repository } from '../core/storage';
import {
  defaultRun,
  defaultSettings,
  type Job,
  type Preferences,
  type Run,
  type Settings,
  type Video,
} from '../core/model';
export interface Workspace {
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
    const [videos, jobs, preferences, settings, run] = await Promise.all([
      repository.videos(),
      repository.jobs(),
      repository.allPreferences(),
      repository.settings(),
      repository.run(),
    ]);
    snapshot = {
      workspace: { videos, jobs, preferences, settings, run },
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
export function useWorkspace() {
  return { ...useSyncExternalStore(subscribe, () => snapshot), refresh };
}
