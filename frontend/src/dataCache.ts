const DB_NAME = "gonetview-data-cache";
const DB_STORE = "json";
const DB_VERSION = 2;

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchJsonCached<T>(url: string, version: string): Promise<T> {
  const key = `${url}?v=${encodeURIComponent(version)}`;
  const cached = await readCache<T>(key);
  if (cached !== undefined) {
    void fetchJson<T>(url).then((value) => writeCache(key, value)).catch(() => undefined);
    return cached;
  }
  const value = await fetchJson<T>(url);
  void writeCache(key, value);
  return value;
}

async function readCache<T>(key: string): Promise<T | undefined> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return undefined;
  }
  try {
    const db = await openCacheDb();
    return await new Promise<T | undefined>((resolve) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result?.value as T | undefined);
      request.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function writeCache(key: string, value: unknown): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return;
  }
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve) => {
      const request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put({ key, value, savedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Cache failures should never block analysis.
  }
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(DB_STORE)) {
        db.deleteObjectStore(DB_STORE);
      }
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
