// Local persistence for humanized documents using IndexedDB so users can
// re-download files from any previous run on this device, even after
// closing the tab. Blobs are stored as-is — no upload required.

const DB_NAME = 'hpersona-humanizer';
const DB_VERSION = 1;
const STORE = 'history';

export interface HumanizedHistoryItem {
  id: string;
  uid: string;
  filename: string;
  originalName: string;
  sizeBytes: number;
  billableWords: number;
  createdAt: number;
  blob: Blob;
}

export interface HumanizedHistoryMeta {
  id: string;
  uid: string;
  filename: string;
  originalName: string;
  sizeBytes: number;
  billableWords: number;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('uid_createdAt', ['uid', 'createdAt']);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result: T | undefined;
        const req = fn(store);
        if (req) {
          req.onsuccess = () => {
            result = req.result;
          };
          req.onerror = () => reject(req.error);
        }
        t.oncomplete = () => resolve(result as T);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export async function saveHumanizedDocument(
  item: Omit<HumanizedHistoryItem, 'id' | 'createdAt'> & { createdAt?: number }
): Promise<HumanizedHistoryMeta> {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = item.createdAt ?? Date.now();
  const full: HumanizedHistoryItem = { ...item, id, createdAt };
  await tx('readwrite', (store) => store.put(full));
  return {
    id,
    uid: full.uid,
    filename: full.filename,
    originalName: full.originalName,
    sizeBytes: full.sizeBytes,
    billableWords: full.billableWords,
    createdAt,
  };
}

export async function listHumanizedDocuments(uid: string): Promise<HumanizedHistoryMeta[]> {
  try {
    const all = await tx<HumanizedHistoryItem[]>('readonly', (store) => store.getAll());
    return (all ?? [])
      .filter((i) => i.uid === uid)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ blob: _blob, ...meta }) => meta);
  } catch {
    return [];
  }
}

export async function getHumanizedBlob(id: string): Promise<{ blob: Blob; filename: string } | null> {
  try {
    const item = await tx<HumanizedHistoryItem>('readonly', (store) => store.get(id));
    if (!item) return null;
    return { blob: item.blob, filename: item.filename };
  } catch {
    return null;
  }
}

export async function deleteHumanizedDocument(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
}
