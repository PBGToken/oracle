import {
    authorizeAllStages,
    authorizeAndSubscribe,
    createSubscription,
    isAuthorized,
    isSubscribed,
    syncSubscription
} from "./auth"
import {
    getDeviceId,
    getIsPrimary,
    getLastHeartbeat,
    getLastSync,
    getPrivateKey,
    getSubscription,
    listEvents,
    openDatabase,
    setDeviceId,
    setIsPrimary,
    setLastSync,
    setPrivateKey
} from "./db"
import { handleFeed } from "./feed"
import { scope } from "./scope"

scope.addEventListener("activate", (event: ExtendableEvent) => {
    event.waitUntil(
        Promise.all([authorizeAndSubscribe(), scope.clients.claim()])
    )

    console.log("Service Worker activated")
})

scope.addEventListener("install", (event: ExtendableEvent) => {
    event.waitUntil(Promise.all([openDatabase(), scope.skipWaiting()]))

    console.log("Service Worker installed")
})

scope.addEventListener("message", (event: ExtendableMessageEvent) => {
    const { method, key, value } = event.data
    const port = event.ports[0]

    const handleSuccess = (data?: any) => {
        port.postMessage({ status: "success", data })
    }

    const handleError = (msg: string) => {
        port.postMessage({ status: "error", error: msg })
    }

    event.waitUntil(
        (async () => {
            try {
                switch (method) {
                    case "get":
                        switch (key) {
                            case "deviceId":
                                handleSuccess(await getDeviceId())
                                break
                            case "events":
                                handleSuccess(await listEvents())
                                break
                            case "isAuthorized":
                                handleSuccess(await isAuthorized())
                                break
                            case "isPrimary":
                                handleSuccess(await getIsPrimary())
                                break
                            case "isSubscribed":
                                handleSuccess(await isSubscribed())
                                break
                            case "lastHeartbeat":
                                handleSuccess(await getLastHeartbeat())
                                break
                            case "lastSync":
                                handleSuccess(await getLastSync())
                                break
                            case "notificationsGranted":
                                handleSuccess(getNotificationsGranted())
                                break
                            case "privateKey":
                                handleSuccess(await getPrivateKey())
                                break
                            case "status":
                                handleSuccess("active")
                                break
                            case "sync":
                                await sync()
                                handleSuccess("ok")
                                break
                            default:
                                handleError(`invalid key "${key}"`)
                        }
                        break
                    case "set":
                        switch (key) {
                            case "deviceId":
                                await setDeviceId(value)
                                handleSuccess()
                                break
                            case "privateKey":
                                await setPrivateKey(value)
                                await authorizeAndSubscribe()
                                handleSuccess()
                                break
                            case "isPrimary":
                                await setIsPrimary(value)
                                handleSuccess()
                                break
                            default:
                                handleError(`invalid key "${key}"`)
                        }
                        break
                    default:
                        handleError(`invalid method "${method}"`)
                }
            } catch (e) {
                handleError("internal error:" + (e as Error).message)
            }
        })()
    )
})

scope.addEventListener("push", (event: PushEvent) => {
    const payload = event.data ? event.data.json() : {}
    const stage: string = payload.stage
    const heartbeat: boolean = !!payload.heartbeat
    const timestamp: number | undefined = payload.timestamp

    // ignore payloads that don't contain .stage
    if (stage) {
        event.waitUntil(
            (async () => {
                await handleFeed(stage, heartbeat, timestamp)
            })()
        )
    }
})

scope.addEventListener("pushsubscriptionchange", async (_event: Event) => {
    await createSubscription()
})

scope.addEventListener("sync", async (_event: Event) => {
    const ls = await getLastSync()

    // don't sync more often than every 5 minutes
    if (Date.now() - ls > 300_000) {
        await sync()
    }
})

function getNotificationsGranted(): boolean {
    return "Notification" in self && Notification.permission == "granted"
}

// this function is triggered when the page reloads and by the "sync" event
async function sync(): Promise<void> {
    // we have to make sure we are still authorized
    await authorizeAllStages()

    const subscription = await getSubscription()

    if (subscription && (await isValidSubscription(subscription))) {
        // the subscription data might be stale, in which it is worthwhile to retry
        try {
            await syncSubscription(subscription)

            await setLastSync(Date.now())

            return
        } catch (_e) {
            // fallthrough and create a fresh subscription
        }
    }

    await createSubscription()

    await setLastSync(Date.now())
}

async function isValidSubscription(subscription: string): Promise<boolean> {
    try {
        const obj = JSON.parse(subscription) as PushSubscriptionJSON

        if (!obj.endpoint) {
            return false
        }

        if (obj.expirationTime != null && obj.expirationTime < Date.now()) {
            return false
        }

        if (!obj.keys) {
            return false
        }

        return true
    } catch (_e) {
        return false
    }
}
