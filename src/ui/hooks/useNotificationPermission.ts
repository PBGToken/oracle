import { useCallback, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "notificationsGranted"

// move this into the service worker
export function useNotificationPermission(): [boolean, () => void, string] {
    const client = useQueryClient()
    const [error, setError] = useState("Notification" in window
        ? Notification.permission == "denied"
            ? "Notifications previously denied"
            : ""
        : "Notification API not available")
    

    const query = useQuery({
        queryKey: [QUERY_KEY],
        queryFn: async () => {
            const b: boolean = await fetchWorker("get", "notificationsGranted")

            return b
        }
    })

    const grant = useCallback(() => {
        if ("Notification" in window) {
            Notification.requestPermission().then((permission) => {
                if (permission == "granted") {
                    client.setQueryData([QUERY_KEY], () => true)
                    setError("")
                } else {
                    client.setQueryData([QUERY_KEY], () => false)
                    setError("User denied notifications")
                }
            })
        } else {
            setError("Notification API not available")
        }
    }, [client, setError])

    return [query.data ?? false, grant, error]
}
