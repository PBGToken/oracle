import { openDatabaseInternal } from "./db"

openDatabaseInternal(() => console.log("Loaded IndexedDB"), () => console.error("Failed to load IndexedDB"))