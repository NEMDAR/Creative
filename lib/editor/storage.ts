import type { CreatorProject } from "./types";

export type PersistedSourceMedia = {
  kind: "video" | "image";
  name: string;
  type: string;
  blob: Blob;
};

export type PhaseOneDraft = {
  id: "phase1";
  project: CreatorProject;
  media: PersistedSourceMedia | null;
  savedAt: number;
};

const DB_NAME = "nemdar-creative-studio";
const DB_VERSION = 1;
const STORE = "drafts";
const KEY = "phase1";

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
    request.onerror = () => reject(request.error ?? new Error("Unable to open browser storage."));
  });
}

export async function savePhaseOneDraft(
  project: CreatorProject,
  source:
    | {
        kind: "video" | "image";
        name: string;
        type: string;
        blob: Blob;
      }
    | null
): Promise<void> {
  const db = await openDb();

  try {
    const draft: PhaseOneDraft = {
      id: KEY,
      project,
      media: source
        ? {
            kind: source.kind,
            name: source.name,
            type: source.type,
            blob: source.blob,
          }
        : null,
      savedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Unable to save draft."));
      tx.onabort = () => reject(tx.error ?? new Error("Draft save was aborted."));
    });
  } finally {
    db.close();
  }
}

export async function loadPhaseOneDraft(): Promise<PhaseOneDraft | null> {
  const db = await openDb();

  try {
    return await new Promise<PhaseOneDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);

      request.onsuccess = () => resolve((request.result as PhaseOneDraft | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Unable to load draft."));
    });
  } finally {
    db.close();
  }
}
