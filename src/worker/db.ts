import { type FeedEvent } from "./FeedEvent"
import { Secrets } from "./Secrets"
import { StageName } from "./stages"

const DB_NAME = "ServiceWorkerDB"
const DB_VERSION = 1
const CONFIG_TABLE = "config"
const EVENTS_TABLE = "events"

export function openDatabaseInternal(
    resolve: (idb: IDBDatabase) => void,
    reject: (e: Error | null) => void
) {
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

export function getDeviceId(): Promise<number> {
    return getConfig("deviceId", 0)
}

export function setDeviceId(id: number): Promise<void> {
    return setConfig("deviceId", id)
}

export function getIsPrimary(): Promise<boolean> {
    return getConfig("isPrimary", false)
}

export function setIsPrimary(primary: boolean): Promise<void> {
    return setConfig("isPrimary", primary)
}

export async function getLastHeartbeat(): Promise<Record<StageName, number>> {
    return {
        Mainnet: await getConfig("lastHeartbeat-Mainnet", 0),
        Beta: await getConfig("lastHeartbeat-Beta", 0),
        Preprod: await getConfig("lastHeartbeat-Preprod", 0)
    }
}

export async function setLastHeartbeat(
    stage: StageName,
    hb: number
): Promise<void> {
    return setConfig(`lastHeartbeat-${stage}`, hb)
}

export function getLastSync(): Promise<number> {
    return getConfig("lastSync", 0)
}

export function setLastSync(t: number): Promise<void> {
    return setConfig("lastSync", t)
}

export function getPrivateKey(): Promise<string> {
    return getConfig("privateKey", "")
}

export function setPrivateKey(hex: string): Promise<void> {
    return setConfig("privateKey", hex)
}

export function getSecrets(stage: StageName): Promise<Secrets | undefined> {
    return getConfig(`secrets/${stage}`, undefined)
}

export function setSecrets(
    stage: StageName,
    secrets: Secrets | undefined
): Promise<void> {
    return setConfig(`secrets/${stage}`, secrets)
}

export function getSubscription(): Promise<string | undefined> {
    return getConfig("subscription", undefined)
}

export function setSubscription(subscription: string): Promise<void> {
    return setConfig("subscription", subscription)
}

async function getConfig<T>(key: string, def: T): Promise<T> {
    try {
        const db = await openDatabase()

        return await get(db, CONFIG_TABLE, key, def)
    } catch (e) {
        console.error("Error getting config:", e)

        return def
    }
}

async function setConfig(key: string, value: any): Promise<void> {
    try {
        const db = await openDatabase()

        // undefined is like deleting
        if (value === undefined) {
            await remove(db, CONFIG_TABLE, key)
            console.log(`${key} deleted from config`)
        } else {
            await put(db, CONFIG_TABLE, { key, value })
            console.log(`${key} saved to config`)
        }
    } catch (e) {
        console.error("Error saving config:", e)
    }
}

function get(
    db: IDBDatabase,
    storeName: string,
    key: any,
    def: any
): Promise<any> {
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

function remove(
    db: IDBDatabase,
    storeName: string,
    key: IDBValidKey
): Promise<void> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)
        const request = store.delete(key)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
    })
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
