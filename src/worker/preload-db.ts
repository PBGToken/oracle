import { openDatabaseInternal } from "./db"

openDatabaseInternal(() => console.log("preloaded db"), () => console.error("failed to preload db"))