import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { styled } from "styled-components"

const root = document.getElementById("root") as HTMLElement

let started = false

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>
)

// TODO: get this from api instead of hardcoded
// end point can then check key
//const subscriptionUrl = "http://ec2-44-203-242-209.compute-1.amazonaws.com:3000"
const subscriptionUrl = "https://stream.preprod.pbgtoken.io:3000"

const VAPID_PUBLIC_KEY = "BD-RNoqSQfw06BlHF0I8v4YKcRrSrcQtTPGRKYQzISkLtcJ0XFfjZ_IPA8xJwsjeKx2WL183jdWQig-6fnPXT30"

export function App() {
    let [infos, setInfos] = useState<string[]>([])
    let [errors, setErrors] = useState<string[]>([])
    const [enabled, setEnabled] = useState(false)

    const log = (msg:string) => {
        setInfos(infos.concat([msg]))
    }

    const enableNotifications = async () => {
        if (!enabled) {
            try {
                await requestPermissions(log)
                await subscribeUserToPush(log)

                setEnabled(true)
            } catch (e) {
                setErrors(errors.concat([(e as Error).message]))
            }
        }
    }
    
    useEffect(() => {
        const fn = async () => {
            if (!started) {
                started = true
                try {
                    await registerServiceWorker(log)
                } catch (e) {
                    setErrors(errors.concat([(e as Error).message]))
                }
            }
        }

        fn()
    }, [])
    
    return <>
        <h1>Hello world</h1>
        {!enabled && <button disabled={enabled} onClick={enableNotifications}>Enable notifications</button>}
        <div>{infos.map((msg, i) => <p key={i}>{msg}</p>)}</div>
        <StyledErrors>{errors.map((e, i) => <p key={i}>{e}</p>)}</StyledErrors>
    </>
}

const StyledErrors = styled.div`
    color: red;
`

async function registerServiceWorker(log: (msg: string) => void) {
    // Register the service worker
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js')
            log('Service Worker registered with scope:' + registration.scope)
        } catch (e) {
            throw new Error('Service Worker registration failed:' + (e as Error).message)
        }
    }
}

async function requestPermissions(log: (msg: string) => void) {
    if (!("Notification" in window)) {
        throw new Error("Notification interface not available")
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        log('Notifications enabled!')
    } else {
        throw new Error('Notifications denied!')
    }
}

async function subscribeUserToPush(log: (msg: string) => void) {
    try {
        const serviceWorkerRegistration = await navigator.serviceWorker.ready

        const subscription = await serviceWorkerRegistration.pushManager.subscribe({
            userVisibleOnly: true,  // Show notification to the user
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        })
    
        log('User is subscribed:' + JSON.stringify(subscription))

        // Send the subscription object to your server
        await sendSubscriptionToServer(subscription, log)
    } catch (e) {
        throw new Error('Failed to subscribe the user:' +  (e as Error).message)        
    }
}
  
// Utility function to convert the VAPID public key to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
  
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }

    return outputArray
}
  

// TODO: what is the type of `subscription`?
async function sendSubscriptionToServer(subscription: PushSubscription, log: (msg: string) => void) {
    try {
        const response = await fetch(`${subscriptionUrl}/subscribe`, {
          method: 'POST',
          body: JSON.stringify(subscription),
          headers: {
            'Content-Type': 'application/json'
          }
        })

        const data = await response.json()

        log('Server received subscription:' + JSON.stringify(data));
    } catch (e) {
        throw new Error('Error sending subscription to server:' + (e as Error).message)
    }
}