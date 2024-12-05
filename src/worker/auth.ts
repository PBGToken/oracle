import { encodeBytes, encodeInt, encodeTuple } from "@helios-lang/cbor"
import { bytesToHex, hexToBytes, makeBase64 } from "@helios-lang/codec-utils"
import { makeBip32PrivateKey } from "@helios-lang/tx-utils"
import { notifyPageOfChange } from "./change"
import { getDeviceId, getPrivateKey } from "./db"
import { scope } from "./scope"

const VAPID_BASE64_CODEC = makeBase64({alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", padChar: "="})
const VAPID_PUBLIC_KEY =
    "BD-RNoqSQfw06BlHF0I8v4YKcRrSrcQtTPGRKYQzISkLtcJ0XFfjZ_IPA8xJwsjeKx2WL183jdWQig-6fnPXT30"

// api keys needed to be able check prices
type Secrets = {
    blockfrostApiKey: string
}

let SECRETS: Secrets | undefined = undefined
let SUBSCRIPTION: PushSubscription | undefined = undefined

// fetches the secrets and creates a Push API subscription if the private key is valid
export async function authorizeAndSubscribe(): Promise<void> {
    try {
        // reset SECRETS
        SECRETS = undefined

        const privateKey = await getPrivateKey()

        if (privateKey == "") {
            return
        }

        const deviceId = await getDeviceId()

        const secrets = await fetchSecrets(privateKey, deviceId)

        if (!secrets) {
            return
        }
        
        SECRETS = secrets

        // now we can create a subscription
        const subscription = await createSubscription(privateKey, deviceId)

        if (!subscription) {
            return
        }

        SUBSCRIPTION = subscription
    } catch (e) {
        console.error(e)
        return
    } finally {
        await notifyPageOfChange()
    }
}

export function isAuthorized(): boolean {
    return SECRETS !== undefined
}

export function isSubscribed(): boolean {
    return SUBSCRIPTION !== undefined
}

// copy this method to the github repo
export function createAuthToken(
    privateKey: string,
    deviceId: number
): string {
    const nonce = Date.now() + Math.floor(Math.random() * 1000)

    const message = encodeTuple([encodeInt(nonce), encodeInt(deviceId)])

    const signature = makeBip32PrivateKey(hexToBytes(privateKey)).sign(message)

    const payload = encodeTuple([encodeBytes(message), signature])

    const payloadHex = bytesToHex(payload)

    return payloadHex
}

// undefined return value signifies unauthorized
async function fetchSecrets(privateKey: string, deviceId: number): Promise<Secrets | undefined> {
    const response = await fetch(
        `https://api.oracle.preprod.pbgtoken.io/secrets`,
        {
            method: "GET",
            mode: "cors",
            headers: {
                Authorization: createAuthToken(
                    privateKey,
                    deviceId
                )
            }
        }
    )

    const data = await response.text()

    return JSON.parse(data) as Secrets // TODO: type-safe
}

async function createSubscription(privateKey: string, deviceId: number): Promise<PushSubscription | undefined> {
    try {
        const subscription = await scope.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: new Uint8Array(VAPID_BASE64_CODEC.decode(VAPID_PUBLIC_KEY))
        })

        const response = await fetch(`https://api.oracle.preprod.pbgtoken.io/subscribe`, {
            method: "POST",
            mode: "cors",
            headers: {
                Authorization: createAuthToken(
                    privateKey, deviceId
                )
            },
            body: JSON.stringify(subscription)
        })

        if (response.status >= 200 && response.status < 300) {
            return subscription
        } else {
            return undefined
        }
    } catch(e) {
        console.error(e)
        return undefined
    }
}