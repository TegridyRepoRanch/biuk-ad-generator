/**
 * IndexedDB wrapper for storing large image blobs.
 *
 * localStorage has a ~5 MB cap. A single Nano Banana Pro image can be 2-4 MB
 * as a base64 data URL, so we keep images in IndexedDB (virtually unlimited)
 * and only store lightweight JSON in localStorage.
 */

const DB_NAME = "ad-creator-images"
const STORE_NAME = "images"
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Save a data URL string to IndexedDB under the given key.
 */
export async function saveImage(key: string, dataUrl: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(dataUrl, key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

/**
 * Load a data URL from IndexedDB by key. Returns null if not found.
 */
export async function loadImage(key: string): Promise<string | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => {
      db.close()
      resolve((req.result as string) ?? null)
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

/**
 * Delete a single image from IndexedDB.
 */
export async function deleteImage(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

/**
 * Clear all images from IndexedDB.
 */
export async function clearImages(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}
