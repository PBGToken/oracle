import { useQuery } from "@tanstack/react-query"

type ResolveCallback = (obj: any) => void
type RejectCallback = (e: Error) => void

const QUERY_KEY = "status"
let pendingMessages: {
    method: "get" | "set"
    key: string
    value?: any
    resolve: ResolveCallback
    reject: RejectCallback
}[] = []

if ("serviceWorker" in navigator && "PushManager" in window) {
    navigator.serviceWorker
        .register("./service-worker.js")
        .then(async () => {
            console.log("Service Worker registered")

            while (!navigator.serviceWorker.controller) {
                await new Promise((resolve) => setTimeout(resolve, 500))
            }

            let pendingMessage = pendingMessages.shift()

            while (pendingMessage) {
                fetchInternal(
                    navigator.serviceWorker.controller,
                    pendingMessage.method,
                    pendingMessage.key,
                    pendingMessage.value,
                    pendingMessage.resolve,
                    pendingMessage.reject
                )

                pendingMessage = pendingMessages.shift()
            }
        })
        .catch(() => {
            console.error("Failed to register Service Worker")
        })
}

function fetchInternal(
    controller: ServiceWorker,
    method: string,
    key: string,
    value: any | undefined,
    resolve: ResolveCallback,
    reject: RejectCallback
) {
    const messageChannel = new MessageChannel()

    messageChannel.port1.onmessage = (event) => {
        if (event.data.status === "success") {
            resolve(event.data.data)
        } else {
            reject(new Error(event.data.error))
        }
    }

    controller.postMessage(
        {
            method,
            key,
            value
        },
        [messageChannel.port2]
    )
}

export function fetchWorker(
    method: "get",
    key:
        | "deviceId"
        | "events"
        | "isAuthorized"
        | "isSubscribed"
        | "notificationsGranted"
        | "privateKey"
        | "status"
): Promise<any>
export function fetchWorker(
    method: "set",
    key: "deviceId" | "privateKey",
    value: any
): Promise<any>
export function fetchWorker(
    method: "get" | "set",
    key:
        | "deviceId"
        | "events"
        | "isAuthorized"
        | "isSubscribed"
        | "notificationsGranted"
        | "privateKey"
        | "status",
    value?: any
): Promise<any> {
    return new Promise((resolve, reject) => {
        if (navigator.serviceWorker.controller) {
            fetchInternal(
                navigator.serviceWorker.controller,
                method,
                key,
                value,
                resolve,
                reject
            )
        } else {
            pendingMessages.push({
                method,
                key,
                value,
                resolve,
                reject
            })
        }
    })
}

export function useServiceWorker(): string {
    const query = useQuery({
        refetchInterval: 1000,
        queryKey: [QUERY_KEY],
        queryFn: async () => {
            const innerStatus: string = await fetchWorker("get", "status")

            return innerStatus
        }
    })

    return query.data ?? "inactive"
}
