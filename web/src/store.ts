import { settingsKey } from '../../core/problems.ts';
import type { Run } from '../../core/run.ts';

// Local run history in IndexedDB. Each record is a Run plus its settings key
// so personal bests and graphs can be grouped by rules.

export interface StoredRun extends Run {
  key: string;
}

const DB_NAME = 'mentat';
const STORE = 'runs';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('key', 'key');
      store.createIndex('startedAt', 'startedAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('history database is blocked by another tab'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRun(run: Run): Promise<StoredRun> {
  const stored: StoredRun = { ...run, key: settingsKey(run.settings) };
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(stored);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return stored;
}

export async function getRun(id: string): Promise<StoredRun | undefined> {
  const db = await open();
  return done(db.transaction(STORE).objectStore(STORE).get(id) as IDBRequest<StoredRun | undefined>);
}

/** All runs, oldest first. */
export async function allRuns(): Promise<StoredRun[]> {
  const db = await open();
  const index = db.transaction(STORE).objectStore(STORE).index('startedAt');
  return done(index.getAll() as IDBRequest<StoredRun[]>);
}

export async function runsFor(key: string): Promise<StoredRun[]> {
  const db = await open();
  const index = db.transaction(STORE).objectStore(STORE).index('key');
  const runs = await done(index.getAll(key) as IDBRequest<StoredRun[]>);
  return runs.sort((a, b) => a.startedAt - b.startedAt);
}

export async function bestFor(key: string, excludeId?: string): Promise<number | null> {
  const runs = await runsFor(key);
  let best: number | null = null;
  for (const r of runs) if (r.id !== excludeId && (best === null || r.score > best)) best = r.score;
  return best;
}

export async function clearRuns(): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
