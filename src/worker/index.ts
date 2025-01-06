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
    getPrivateKey,
    getSubscription,
    listEvents,
    openDatabase,
    setDeviceId,
    setIsPrimary,
    setPrivateKey
} from "./db"
import { showNotification, signFeed } from "./feed"
import { scope } from "./scope"
import { createAuthToken } from "./Secrets"
import { isValidStageName, stages } from "./stages"

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

    console.log("Received heartbeat message", heartbeat, stage)

    event.waitUntil(
        (async () => {
            if (heartbeat) {
                if ((await getIsPrimary()) && isValidStageName(stage)) {
                    // TODO: include the response delay in the notification body
                    await showNotification(
                        "Heartbeat",
                        `${stage}${payload.timestamp ? `, delay=${Date.now() - payload.timestamp}ms` : ""}`
                    )

                    const baseUrl = stages[stage].baseUrl

                    const privateKey = await getPrivateKey()
                    const deviceId = await getDeviceId()

                    await fetch(`${baseUrl}/pong`, {
                        method: "POST",
                        mode: "cors",
                        headers: {
                            Authorization: createAuthToken(privateKey, deviceId)
                        },
                        body: JSON.stringify({})
                    })
                }
            } else {
                await signFeed(stage)
            }
        })()
    )
})

scope.addEventListener("pushsubscriptionchange", async (_event: Event) => {
    await createSubscription()
})

function getNotificationsGranted(): boolean {
    return "Notification" in self && Notification.permission == "granted"
}

// this function is triggered when the page reloads
async function sync(): Promise<void> {
    // we have to make sure we are still authorized
    await authorizeAllStages()

    let subscription = await getSubscription()

    if (subscription && (await isValidSubscription(subscription))) {
        await syncSubscription(subscription)
    } else {
        await createSubscription()
    }
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
