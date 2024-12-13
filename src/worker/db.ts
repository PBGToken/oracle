import { type FeedEvent } from "./FeedEvent"

const DB_NAME = "ServiceWorkerDB"
const DB_VERSION = 1
const CONFIG_TABLE = "config"
const EVENTS_TABLE = "events"

export function openDatabaseInternal(resolve: (idb: IDBDatabase) => void, reject: (e: Error | null) => void) {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (_event: IDBVersionChangeEvent) => {
        const db = request.result

        // Create object stores if they don't already exist
        if (!db.objectStoreNames.contains(CONFIG_TABLE)) {
            db.createObjectStore(CONFIG_TABLE, { keyPath: "key" })
        }
        if (!db.objectStoreNames.contains(EVENTS_TABLE)) {
            db.createObjectStore(EVENTS_TABLE, { autoIncrement: true })
        }
    }

    request.onsuccess = () => {
        resolve(request.result)
    }

    request.onerror = () => {
        reject(request.error)
    }
}

export function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        openDatabaseInternal(resolve, reject)
    })
}

export async function appendEvent(event: FeedEvent): Promise<void> {
    try {
        const db = await openDatabase()

        await put(db, EVENTS_TABLE, event)

        console.log("Event saved")
    } catch (e) {
        console.error("Error saving event:", e)
    }
}

export function getDeviceId(): Promise<number> {
    return getConfig("deviceId", 0)
}

export function getPrivateKey(): Promise<string> {
    return getConfig("privateKey", "")
}

// TODO: type-safe events
export async function listEvents(): Promise<FeedEvent[]> {
    try {
        const db = await openDatabase()

        return await list(db, EVENTS_TABLE)
    } catch (e) {
        console.error("Error listing events:", e)

        return []
    }
}

export function setDeviceId(id: number): Promise<void> {
    return setConfig("deviceId", id)
}

export function setPrivateKey(hex: string): Promise<void> {
    return setConfig("privateKey", hex)
}

async function getConfig<T>(key: string, def: T): Promise<T> {
    try {
        const db = await openDatabase()

        return (await get(db, CONFIG_TABLE, key, def))
    } catch (e) {
        console.error("Error getting config:", e)

        return def
    }
}

async function setConfig(key: string, value: any): Promise<void> {
    try {
        const db = await openDatabase()

        await put(db, CONFIG_TABLE, { key, value })

        console.log("Config saved")
    } catch (e) {
        console.error("Error saving config:", e)
    }
}

function put(db: IDBDatabase, storeName: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)
        const request = store.put(data)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
    })
}

function get(db: IDBDatabase, storeName: string, key: any, def: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly")
        const store = transaction.objectStore(storeName)
        const request = store.get(key)

        request.onsuccess = () => resolve(request.result?.value ?? def)
        request.onerror = () => reject(request.error)
    })
}

function list(db: IDBDatabase, storeName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly")
        const store = transaction.objectStore(storeName)
        const request = store.getAll()

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}
