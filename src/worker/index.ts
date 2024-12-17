import { authorizeAllStages, authorizeAndSubscribe, isAuthorized, isSubscribed } from "./auth"
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

//self.addEventListener("pushsubscriptionchange", async (event: Event) => {
//    console.log('Push subscription change detected:', event);
//  
//    try {
//      // Re-subscribe to the Push Service
//      const applicationServerKey = '<YOUR_APPLICATION_SERVER_PUBLIC_KEY>'; // VAPID Public Key
//      const newSubscription = await scope.registration.pushManager.subscribe({
//        userVisibleOnly: true,
//        applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
//      });
//  
//      console.log('New subscription:', JSON.stringify(newSubscription));
//  
//      // Send the new subscription to your backend
//      await fetch('/api/update-subscription', {
//        method: 'POST',
//        headers: { 'Content-Type': 'application/json' },
//        body: JSON.stringify(newSubscription),
//      });
//  
//      console.log('Subscription updated successfully.');
//    } catch (error) {
//      console.error('Failed to update subscription:', error);
//    }
//  });

function getNotificationsGranted(): boolean {
    return "Notification" in self && Notification.permission == "granted"
}

// this function is triggered when the page reloads
async function sync(): Promise<void> {
    // we have to make sure we are still authorized
    await authorizeAllStages()
}   