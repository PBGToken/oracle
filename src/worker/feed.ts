import { bytesToHex, hexToBytes } from "@helios-lang/codec-utils"
import { type Tx, type Signature, decodeTx } from "@helios-lang/ledger"
import { makeBip32PrivateKey } from "@helios-lang/tx-utils"
import { type FeedEvent } from "./FeedEvent"
import { appendEvent, getDeviceId, getPrivateKey } from "./db"
import { scope } from "./scope"
import { createAuthToken } from "./Secrets"

type NotificationOptions = {
    body: string
    icon: string
    badge: string
}

export async function signFeed(options: NotificationOptions): Promise<void> {
    const privateKey = await getPrivateKey()
    const deviceId = await getDeviceId()

    const tx = await fetchPriceFeed(privateKey, deviceId)

    if (tx) {
        // sign it
        const pk = makeBip32PrivateKey(hexToBytes(privateKey))

        const id = tx.body.hash()

        const signature = pk.sign(id)

        // upload the signature
        await putSignature(privateKey, deviceId, signature)

        // finally add event to table
        const event: FeedEvent = {
            hash: bytesToHex(id),
            timestamp: Date.now(),
            prices: {} // TODO: fetch from tx and validate
        }

        await appendEvent(event)

        await scope.registration.showNotification("Signed price feed tx", {
            ...options,
            body: bytesToHex(id)
        })
    } else {
        await scope.registration.showNotification("Missing tx", {
            ...options
        })
    }
}

async function fetchPriceFeed(
    privateKey: string,
    deviceId: number
): Promise<Tx | undefined> {
    try {
        const response = await fetch(`https://api.oracle.token.pbg.io/feed`, {
            method: "GET",
            mode: "cors",
            headers: {
                Authorization: createAuthToken(privateKey, deviceId)
            }
        })

        if (response.status >= 200 && response.status < 300) {
            const text = await response.text()
            const obj = JSON.parse(text)

            if ("tx" in obj && typeof obj.tx == "string") {
                return decodeTx(obj.tx)
            } else {
                return undefined
            }
        } else {
            return undefined
        }
    } catch (e) {
        console.error(e)
        return undefined
    }
}

async function putSignature(
    privateKey: string,
    deviceId: number,
    signature: Signature
): Promise<void> {
    try {
        await fetch(`https://api.oracle.token.pbg.io/feed`, {
            method: "POST",
            mode: "cors",
            headers: {
                Authorization: createAuthToken(privateKey, deviceId)
            },
            body: bytesToHex(signature.toCbor())
        })
    } catch (e) {
        console.error(e)
    }
}
