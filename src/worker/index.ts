import { authorizeAndSubscribe, isAuthorized, isSubscribed } from "./auth"
import {
    getDeviceId,
    getPrivateKey,
    listEvents,
    openDatabase,
    setDeviceId,
    setPrivateKey
} from "./db"
import { signFeed } from "./feed"
import { scope } from "./scope"


scope.addEventListener("activate", (event: ExtendableEvent) => {
    event.waitUntil(Promise.all([authorizeAndSubscribe(), scope.clients.claim()]))

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
                                handleSuccess(isAuthorized())
                                break
                            case "isSubscribed":
                                handleSuccess(isSubscribed())
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
    const message = payload.message || "N/A"
    //const stage = payload.stage || "preprod"

    const options = {
        body: message,
        icon: "icon.png",
        badge: "badge.png"
    }

    event.waitUntil(signFeed(options))
})

function getNotificationsGranted(): boolean {
    return "Notification" in self && Notification.permission == "granted"
}