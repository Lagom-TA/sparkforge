export interface WorkspacePreferences {
  defaultPreview: 'desktop' | 'mobile';
  autoOpenArtifact: boolean;
  compactTimeline: boolean;
  reduceMotion: boolean;
  confirmRecordDeletion: boolean;
  completionNotifications: boolean;
  errorNotifications: boolean;
}

export const defaultPreferences: WorkspacePreferences = {
  defaultPreview: 'desktop',
  autoOpenArtifact: true,
  compactTimeline: false,
  reduceMotion: false,
  confirmRecordDeletion: true,
  completionNotifications: true,
  errorNotifications: true,
};

const STORAGE_KEY = 'sparkforge.workspace.preferences';

export function getPreferences(): WorkspacePreferences {
  if (typeof window === 'undefined') return defaultPreferences;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? { ...defaultPreferences, ...JSON.parse(stored) } : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: WorkspacePreferences) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent('sparkforge:preferences', { detail: preferences }));
  applyPreferences(preferences);
}

export function applyPreferences(preferences = getPreferences()) {
  document.documentElement.classList.toggle('reduce-motion', preferences.reduceMotion);
}

export function subscribePreferences(callback: (preferences: WorkspacePreferences) => void) {
  const handlePreferenceEvent = (event: Event) => {
    const detail = (event as CustomEvent).detail as WorkspacePreferences | undefined;
    callback(detail ?? getPreferences());
  };
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      callback(getPreferences());
    }
  };

  window.addEventListener('sparkforge:preferences', handlePreferenceEvent);
  window.addEventListener('storage', handleStorageEvent);
  return () => {
    window.removeEventListener('sparkforge:preferences', handlePreferenceEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}