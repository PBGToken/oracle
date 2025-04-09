import { scope } from "./scope"

export async function notifyPageOfChange() {
    const clients = await scope.clients.matchAll({ includeUncontrolled: true })

    for (const client of clients) {
        client.postMessage({
            type: "change",
            payload: {}
        })
    }
}
