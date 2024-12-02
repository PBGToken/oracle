import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

const root = document.getElementById("root") as HTMLElement

createRoot(root).render(
    <StrictMode>
        <h1>Hello world</h1>
    </StrictMode>
)

const VAPID_PUBLIC_KEY = "BD-RNoqSQfw06BlHF0I8v4YKcRrSrcQtTPGRKYQzISkLtcJ0XFfjZ_IPA8xJwsjeKx2WL183jdWQig-6fnPXT30"

async function main() {
    await registerServiceWorker()
    await requestPermissions()
    await subscribeUserToPush()
}

async function registerServiceWorker() {
// Register the service worker
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js')
            console.log('Service Worker registered with scope:', registration.scope)
        } catch (e) {
            console.error('Service Worker registration failed:', e)
        }
    }
}

async function requestPermissions() {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        console.log('Notifications enabled!');
    } else {
        console.error('Notifications denied!');
    }
}

async function subscribeUserToPush() {
    try {
        const serviceWorkerRegistration = await navigator.serviceWorker.ready

        const subscription = await serviceWorkerRegistration.pushManager.subscribe({
            userVisibleOnly: true,  // Show notification to the user
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        })
    
        console.log('User is subscribed:', subscription);
        // Send the subscription object to your server
        await sendSubscriptionToServer(subscription);
    } catch (e) {
        console.error('Failed to subscribe the user:', e);
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
async function sendSubscriptionToServer(subscription: any) {
    try {
        const response = await fetch('http://stream.preprod.pbgtoken.io:3000/subscribe', {
          method: 'POST',
          body: JSON.stringify(subscription),
          headers: {
            'Content-Type': 'application/json'
          }
        })

        const data = await response.json()

        console.log('Server received subscription:', data);
    } catch (e) {
        console.error('Error sending subscription to server:', e);
    }
}  
  
main()