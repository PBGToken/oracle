import { useEffect, useState } from "react"
import { useWorkerTickInternal } from "./useWorkerTick"

type ServiceWorkerStatus = "unregistered" | "registering" | "registered" | "unavailable" | "failed"

export function useServiceWorker(): ServiceWorkerStatus {
    const [tick, setTick] = useWorkerTickInternal()
    const [status, setStatus] = useState<ServiceWorkerStatus>("unregistered")

    useEffect(() => {
        if (status == "unregistered") {
            setStatus("registering")

            // Register the service worker
            if ("serviceWorker" in navigator && "PushManager" in window) {
                navigator.serviceWorker.register(
                    "./service-worker.js"
                ).then(() => {
                    setStatus("registered")
                }).catch(() => {
                    setStatus("failed")
                })                
            } else {
                setStatus("unavailable")
            }
        }
    }, [])

    useEffect(() => {
        if (status == "registered") {
            navigator.serviceWorker.addEventListener('message', (event) => {
                const { type } = event.data;
              
                if (type === 'change') {
                    setTick(tick + 1)
                }
            })
        }
    }, [status])

    return status
}