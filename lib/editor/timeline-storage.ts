import type { TimelineClip, TimelineAssetKind } from "./timeline";

export type PersistedTimelineAsset = {
  id: string;
  kind: TimelineAssetKind;
  name: string;
  type: string;
  duration: number;
  blob: Blob;
};

export type TimelineDraft = {
  id: "phase2";
  schemaVersion: 2;
  playhead: number;
  clips: TimelineClip[];
  assets: PersistedTimelineAsset[];
  savedAt: number;
};

const DB_NAME = "nemdar-creative-studio";
const DB_VERSION = 1;
const STORE = "drafts";
const KEY = "phase2";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open timeline storage."));
  });
}

export async function saveTimelineDraft(draft: Omit<TimelineDraft, "id" | "schemaVersion" | "savedAt">) {
  const db = await openDb();
  try {
    const payload: TimelineDraft = {
      id: KEY,
      schemaVersion: 2,
      ...draft,
      savedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Unable to save timeline."));
      tx.onabort = () => reject(tx.error ?? new Error("Timeline save was aborted."));
    });
  } finally {
    db.close();
  }
}

export async function loadTimelineDraft(): Promise<TimelineDraft | null> {
  const db = await openDb();
  try {
    return await new Promise<TimelineDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () =>
        resolve((request.result as TimelineDraft | undefined) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to load timeline."));
    });
  } finally {
    db.close();
  }
}
