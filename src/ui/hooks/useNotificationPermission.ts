import { useCallback, useState } from "react"

const initGranted =
    "Notification" in window && Notification.permission == "granted"
const initError =
    "Notification" in window
        ? Notification.permission == "denied"
            ? "Notifications previously denied"
            : ""
        : "Notification API not available"

export function useNotificationPermission(): [boolean, () => void, string] {
    const [granted, setGranted] = useState(initGranted)
    const [error, setError] = useState(initError)

    const grant = useCallback(() => {
        if ("Notification" in window) {
            Notification.requestPermission().then((permission) => {
                if (permission == "granted") {
                    setGranted(true)
                } else {
                    setGranted(false)
                    setError("User denied notifications")
                }
            })
        } else {
            setError("Notification API not available")
        }
    }, [setGranted, setError])

    return [granted, grant, error]
}
