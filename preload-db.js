// src/worker/db.ts
var DB_NAME = "ServiceWorkerDB";
var DB_VERSION = 1;
var CONFIG_TABLE = "config";
var EVENTS_TABLE = "events";
function openDatabaseInternal(resolve, reject) {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = (_event) => {
    const db = request.result;
    if (!db.objectStoreNames.contains(CONFIG_TABLE)) {
      db.createObjectStore(CONFIG_TABLE, { keyPath: "key" });
    }
    if (!db.objectStoreNames.contains(EVENTS_TABLE)) {
      db.createObjectStore(EVENTS_TABLE, { autoIncrement: true });
    }
  };
  request.onsuccess = () => {
    resolve(request.result);
  };
  request.onerror = () => {
    reject(request.error);
  };
}

// src/worker/preload-db.ts
openDatabaseInternal(() => console.log("Loaded IndexedDB"), () => console.error("Failed to load IndexedDB"));
