// A very small promise wrapper over IndexedDB. Everything the app keeps for
// offline use lives here: the saved rows of each table, the changes waiting to
// be sent, and a few cached responses.

const DB_NAME = "shop-offline-v1"
const STORES = ["rows", "urls", "queue", "failed", "meta"] as const
type StoreName = (typeof STORES)[number]

let opened: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"))
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        const rows = db.createObjectStore("rows", { keyPath: "k" })
        rows.createIndex("t", "t")
        db.createObjectStore("urls", { keyPath: "k" })
        db.createObjectStore("queue", { keyPath: "seq", autoIncrement: true })
        db.createObjectStore("failed", { keyPath: "seq" })
        db.createObjectStore("meta", { keyPath: "k" })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    opened.catch(() => {
      opened = null
    })
  }
  return opened
}

/** True when this device can keep data for offline use. */
export async function idbAvailable(): Promise<boolean> {
  try {
    await open()
    return true
  } catch {
    return false
  }
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await open()
  return done(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  const db = await open()
  return done(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>
}

export async function idbByIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> {
  const db = await open()
  return done(db.transaction(store).objectStore(store).index(index).getAll(key)) as Promise<T[]>
}

export async function idbPut(store: StoreName, value: unknown): Promise<IDBValidKey> {
  const db = await open()
  const tx = db.transaction(store, "readwrite")
  const key = await done(tx.objectStore(store).put(value))
  await finished(tx)
  return key
}

export async function idbPutMany(store: StoreName, values: unknown[]): Promise<void> {
  if (values.length === 0) return
  const db = await open()
  const tx = db.transaction(store, "readwrite")
  const os = tx.objectStore(store)
  for (const v of values) os.put(v)
  await finished(tx)
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await open()
  const tx = db.transaction(store, "readwrite")
  tx.objectStore(store).delete(key)
  await finished(tx)
}

export async function idbDeleteMany(store: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (keys.length === 0) return
  const db = await open()
  const tx = db.transaction(store, "readwrite")
  const os = tx.objectStore(store)
  for (const k of keys) os.delete(k)
  await finished(tx)
}

/** Swaps every row saved under `index = key` for `values`, in one step. */
export async function idbReplaceByIndex(store: StoreName, index: string, key: IDBValidKey, values: unknown[]): Promise<void> {
  const db = await open()
  const tx = db.transaction(store, "readwrite")
  const os = tx.objectStore(store)
  const existing = await done(os.index(index).getAllKeys(key))
  for (const k of existing) os.delete(k)
  for (const v of values) os.put(v)
  await finished(tx)
}

export async function idbClearAll(): Promise<void> {
  const db = await open()
  const tx = db.transaction([...STORES], "readwrite")
  for (const s of STORES) tx.objectStore(s).clear()
  await finished(tx)
}
