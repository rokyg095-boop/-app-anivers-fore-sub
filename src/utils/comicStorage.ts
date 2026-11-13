// IndexedDB Storage for custom or imported comic chapter pages
const DB_NAME = 'aniverse_comic_db';
const DB_VERSION = 1;
const STORE_NAME = 'chapter_pages';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    let settled = false;
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        // We already gave up (blocked); don't leak the late connection
        db.close();
        return;
      }
      settled = true;
      // Let a future schema upgrade (in this or another tab) proceed instead of being blocked
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error);
    };

    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB open is blocked by another open tab'));
    };
  });
}

export async function getStoredChapterPages(
  comicId: string,
  chapterId: string
): Promise<string[] | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    const database = db;
    return await new Promise<string[] | null>((resolve) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const key = `${comicId}_${chapterId}`;
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (Array.isArray(result) && result.length > 0) {
          resolve(result);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };

      transaction.onabort = () => {
        resolve(null);
      };
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

// Resolves only once the transaction has committed (quota errors surface as a transaction abort,
// after the individual request may already have reported success).
async function runWriteTransaction(op: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) =>
        reject((event.target as IDBRequest | null)?.error || transaction.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error('IndexedDB transaction was aborted'));
      op(transaction.objectStore(STORE_NAME));
    });
  } finally {
    db.close();
  }
}

export async function saveChapterPages(
  comicId: string,
  chapterId: string,
  pages: string[]
): Promise<void> {
  const key = `${comicId}_${chapterId}`;
  await runWriteTransaction((store) => {
    store.put(pages, key);
  });
}

export async function deleteChapterPages(
  comicId: string,
  chapterId: string
): Promise<void> {
  const key = `${comicId}_${chapterId}`;
  await runWriteTransaction((store) => {
    store.delete(key);
  });
}
