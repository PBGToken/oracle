// @ts-nocheck
// TODO: how to make this typesafe?
// TODO: how to output this from a src/service-worker.ts file? Use esbuild?

self.addEventListener('install', event => {
    console.log('Service Worker installed')
    self.skipWaiting()
})
  
self.addEventListener('activate', event => {
    console.log('Service Worker activated');
})

self.addEventListener('push', event => {
    const payload = event.data ? event.data.json() : {};
    const title = payload.title || 'New Notification';
    const message = payload.message || 'You have a new message';
  
    const options = {
        body: message,
        icon: 'icon.png',
        badge: 'badge.png'
    }
  
    event.waitUntil(
        self.registration.showNotification(title, options)
    )
})