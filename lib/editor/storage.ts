import { normalizeCaptionStyle, type CaptionStyleConfig, type CaptionTrack } from "./captions";
import { normalizeBrandKit, type BrandKit } from "./brand-kit";
import type { AssetGenerationMetadata } from "./assets";
import type { TimelineState } from "./timeline";
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

export type PersistableMediaItem = {
  id: string;
  kind: "video" | "image";
  name: string;
  type: string;
  duration: number;
  generation?: AssetGenerationMetadata;
  blob: Blob;
};

export type PersistableAudioTrack = {
  id: string;
  name: string;
  type: string;
  duration: number;
  startTime: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  duckingEnabled: boolean;
  duckingGain: number;
  generation?: AssetGenerationMetadata;
  blob: Blob;
};

export type PhaseTwoSaveInput = {
  project: CreatorProject;
  mediaItems: PersistableMediaItem[];
  timeline: TimelineState;
  audioTrack: PersistableAudioTrack | null;
  captions: CaptionTrack | null;
  captionStyle: CaptionStyleConfig;
  brandKit: BrandKit;
  timelineZoom: number;
  snapEnabled: boolean;
  selectedClipId: string | null;
  selectedOverlayId: string | null;
};

type PersistedMediaItem = Omit<PersistableMediaItem, "blob">;
type PersistedAudioTrack = Omit<PersistableAudioTrack, "blob">;

type PersistedPhaseTwoState = {
  project: CreatorProject;
  mediaItems: PersistedMediaItem[];
  timeline: TimelineState;
  audioTrack: PersistedAudioTrack | null;
  captions: CaptionTrack | null;
  captionStyle: CaptionStyleConfig;
  brandKit: BrandKit;
  timelineZoom: number;
  snapEnabled: boolean;
  selectedClipId: string | null;
  selectedOverlayId: string | null;
};

export type PhaseTwoDraft = PersistedPhaseTwoState & {
  id: "phase2";
  savedAt: number;
};

export type PhaseTwoSnapshot = PersistedPhaseTwoState & {
  id: string;
  savedAt: number;
  reason: "auto" | "manual";
};

export type HydratedPhaseTwoState = PhaseTwoSaveInput & {
  savedAt: number;
  snapshotId?: string;
  snapshotReason?: "auto" | "manual";
};

export type PhaseTwoSnapshotSummary = {
  id: string;
  savedAt: number;
  reason: "auto" | "manual";
  projectName: string;
  mediaCount: number;
  duration: number;
};

type AssetRecord = {
  id: string;
  kind: "video" | "image" | "audio";
  name: string;
  type: string;
  duration: number;
  blob: Blob;
};

const DB_NAME = "nemdar-creative-studio";
const DB_VERSION = 2;
const DRAFT_STORE = "drafts";
const ASSET_STORE = "assets";
const SNAPSHOT_STORE = "snapshots";
const PHASE_ONE_KEY = "phase1";
const PHASE_TWO_KEY = "phase2";
const BRAND_KIT_KEY = "brand-kit";
const SNAPSHOT_LIMIT = 10;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        db.createObjectStore(ASSET_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const snapshots = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
        snapshots.createIndex("savedAt", "savedAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open browser storage."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("Browser storage transaction failed."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("Browser storage transaction was aborted."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Browser storage request failed."));
  });
}

function toPersistedPhaseTwoState(input: PhaseTwoSaveInput): PersistedPhaseTwoState {
  return {
    project: input.project,
    mediaItems: input.mediaItems.map(({ blob: _blob, ...item }) => item),
    timeline: input.timeline,
    audioTrack: input.audioTrack
      ? (({ blob: _blob, ...track }) => track)(input.audioTrack)
      : null,
    captions: input.captions ?? null,
    captionStyle: input.captionStyle,
    brandKit: input.brandKit,
    timelineZoom: input.timelineZoom,
    snapEnabled: input.snapEnabled,
    selectedClipId: input.selectedClipId,
    selectedOverlayId: input.selectedOverlayId,
  };
}

function writeAssets(store: IDBObjectStore, input: PhaseTwoSaveInput) {
  for (const item of input.mediaItems) {
    const asset: AssetRecord = {
      id: item.id,
      kind: item.kind,
      name: item.name,
      type: item.type,
      duration: item.duration,
      blob: item.blob,
    };
    store.put(asset);
  }

  if (input.audioTrack) {
    const asset: AssetRecord = {
      id: input.audioTrack.id,
      kind: "audio",
      name: input.audioTrack.name,
      type: input.audioTrack.type,
      duration: input.audioTrack.duration,
      blob: input.audioTrack.blob,
    };
    store.put(asset);
  }
}

async function hydratePhaseTwoState(
  db: IDBDatabase,
  state: PersistedPhaseTwoState,
  savedAt: number,
  snapshotId?: string,
  snapshotReason?: "auto" | "manual"
): Promise<HydratedPhaseTwoState> {
  const tx = db.transaction(ASSET_STORE, "readonly");
  const store = tx.objectStore(ASSET_STORE);

  const mediaItems: PersistableMediaItem[] = [];
  for (const item of state.mediaItems) {
    const asset = await requestResult<AssetRecord | undefined>(store.get(item.id));
    if (!asset?.blob) continue;
    mediaItems.push({
      ...item,
      blob: asset.blob,
    });
  }

  let audioTrack: PersistableAudioTrack | null = null;
  if (state.audioTrack) {
    const asset = await requestResult<AssetRecord | undefined>(
      store.get(state.audioTrack.id)
    );
    if (asset?.blob) {
      audioTrack = {
        ...state.audioTrack,
        blob: asset.blob,
      };
    }
  }

  await transactionDone(tx);

  return {
    project: state.project,
    mediaItems,
    timeline: state.timeline,
    audioTrack,
    captions: state.captions ?? null,
    captionStyle: normalizeCaptionStyle(state.captionStyle),
    brandKit: normalizeBrandKit(state.brandKit),
    timelineZoom: state.timelineZoom,
    snapEnabled: state.snapEnabled,
    selectedClipId: state.selectedClipId,
    selectedOverlayId: state.selectedOverlayId,
    savedAt,
    snapshotId,
    snapshotReason,
  };
}

type BrandKitRecord = {
  id: "brand-kit";
  brandKit: BrandKit;
  savedAt: number;
};

export async function saveBrandKit(brandKit: BrandKit): Promise<number> {
  const db = await openDb();
  const savedAt = Date.now();

  try {
    const tx = db.transaction(DRAFT_STORE, "readwrite");
    const record: BrandKitRecord = {
      id: BRAND_KIT_KEY,
      brandKit: normalizeBrandKit(brandKit),
      savedAt,
    };
    tx.objectStore(DRAFT_STORE).put(record);
    await transactionDone(tx);
    return savedAt;
  } finally {
    db.close();
  }
}

export async function loadBrandKit(): Promise<BrandKit | null> {
  const db = await openDb();

  try {
    const tx = db.transaction(DRAFT_STORE, "readonly");
    const record = await requestResult<BrandKitRecord | undefined>(
      tx.objectStore(DRAFT_STORE).get(BRAND_KIT_KEY)
    );
    await transactionDone(tx);
    return record ? normalizeBrandKit(record.brandKit) : null;
  } finally {
    db.close();
  }
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
      id: PHASE_ONE_KEY,
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

    const tx = db.transaction(DRAFT_STORE, "readwrite");
    tx.objectStore(DRAFT_STORE).put(draft);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function loadPhaseOneDraft(): Promise<PhaseOneDraft | null> {
  const db = await openDb();

  try {
    const tx = db.transaction(DRAFT_STORE, "readonly");
    const request = tx.objectStore(DRAFT_STORE).get(PHASE_ONE_KEY);
    const result = await requestResult<PhaseOneDraft | undefined>(request);
    await transactionDone(tx);
    return result ?? null;
  } finally {
    db.close();
  }
}

export async function savePhaseTwoDraft(
  input: PhaseTwoSaveInput
): Promise<number> {
  const db = await openDb();
  const savedAt = Date.now();

  try {
    const draft: PhaseTwoDraft = {
      id: PHASE_TWO_KEY,
      ...toPersistedPhaseTwoState(input),
      savedAt,
    };
    const tx = db.transaction([DRAFT_STORE, ASSET_STORE], "readwrite");
    writeAssets(tx.objectStore(ASSET_STORE), input);
    tx.objectStore(DRAFT_STORE).put(draft);
    await transactionDone(tx);
    return savedAt;
  } finally {
    db.close();
  }
}

export async function loadPhaseTwoDraft(): Promise<HydratedPhaseTwoState | null> {
  const db = await openDb();

  try {
    const tx = db.transaction(DRAFT_STORE, "readonly");
    const request = tx.objectStore(DRAFT_STORE).get(PHASE_TWO_KEY);
    const draft = await requestResult<PhaseTwoDraft | undefined>(request);
    await transactionDone(tx);
    if (!draft) return null;
    return hydratePhaseTwoState(db, draft, draft.savedAt);
  } finally {
    db.close();
  }
}

export async function savePhaseTwoSnapshot(
  input: PhaseTwoSaveInput,
  reason: "auto" | "manual" = "manual"
): Promise<PhaseTwoSnapshotSummary> {
  const db = await openDb();
  const savedAt = Date.now();
  const id = `snapshot-${savedAt}-${crypto.randomUUID()}`;

  try {
    const snapshot: PhaseTwoSnapshot = {
      id,
      ...toPersistedPhaseTwoState(input),
      savedAt,
      reason,
    };

    const tx = db.transaction([ASSET_STORE, SNAPSHOT_STORE], "readwrite");
    writeAssets(tx.objectStore(ASSET_STORE), input);
    tx.objectStore(SNAPSHOT_STORE).put(snapshot);
    await transactionDone(tx);

    await pruneSnapshots(db);

    return {
      id,
      savedAt,
      reason,
      projectName: input.project.name,
      mediaCount: input.mediaItems.length,
      duration: input.timeline.duration,
    };
  } finally {
    db.close();
  }
}

async function pruneSnapshots(db: IDBDatabase) {
  const readTx = db.transaction(SNAPSHOT_STORE, "readonly");
  const all = await requestResult<PhaseTwoSnapshot[]>(
    readTx.objectStore(SNAPSHOT_STORE).getAll()
  );
  await transactionDone(readTx);

  const stale = all
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(SNAPSHOT_LIMIT);

  if (stale.length === 0) return;
  const deleteTx = db.transaction(SNAPSHOT_STORE, "readwrite");
  const store = deleteTx.objectStore(SNAPSHOT_STORE);
  for (const snapshot of stale) {
    store.delete(snapshot.id);
  }
  await transactionDone(deleteTx);
}

export async function listPhaseTwoSnapshots(): Promise<PhaseTwoSnapshotSummary[]> {
  const db = await openDb();

  try {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const all = await requestResult<PhaseTwoSnapshot[]>(
      tx.objectStore(SNAPSHOT_STORE).getAll()
    );
    await transactionDone(tx);

    return all
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((snapshot) => ({
        id: snapshot.id,
        savedAt: snapshot.savedAt,
        reason: snapshot.reason,
        projectName: snapshot.project.name,
        mediaCount: snapshot.mediaItems.length,
        duration: snapshot.timeline.duration,
      }));
  } finally {
    db.close();
  }
}

export async function loadPhaseTwoSnapshot(
  id: string
): Promise<HydratedPhaseTwoState | null> {
  const db = await openDb();

  try {
    const tx = db.transaction(SNAPSHOT_STORE, "readonly");
    const snapshot = await requestResult<PhaseTwoSnapshot | undefined>(
      tx.objectStore(SNAPSHOT_STORE).get(id)
    );
    await transactionDone(tx);
    if (!snapshot) return null;

    return hydratePhaseTwoState(
      db,
      snapshot,
      snapshot.savedAt,
      snapshot.id,
      snapshot.reason
    );
  } finally {
    db.close();
  }
}
