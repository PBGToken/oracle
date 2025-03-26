import {
    bytesToHex,
    decodeIntBE,
    encodeIntBE,
    hexToBytes,
    makeBase64
} from "@helios-lang/codec-utils"
import { SchnorrSecp256k1 } from "@helios-lang/crypto"
import {
    getDeviceId,
    getIsPrimary,
    getPrivateKey,
    getSecrets,
    getSubscription,
    setSecrets,
    setSubscription
} from "./db"
import { scope } from "./scope"
import { createAuthToken, fetchSecrets } from "./Secrets"
import { STAGE_NAMES, StageName, stages } from "./stages"

const VAPID_BASE64_CODEC = makeBase64({
    alphabet:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
    padChar: "="
})
const VAPID_PUBLIC_KEY =
    "BD-RNoqSQfw06BlHF0I8v4YKcRrSrcQtTPGRKYQzISkLtcJ0XFfjZ_IPA8xJwsjeKx2WL183jdWQig-6fnPXT30"

// fetches the secrets and creates a Push API subscription if the private key is valid
export async function authorizeAndSubscribe(): Promise<void> {
    try {
        await authorizeAllStages()

        // now we can create a subscription
        await createSubscription()
    } catch (e) {
        console.error(e)
        return
    }
}

export async function authorizeAllStages(): Promise<void> {
    try {
        await authorizeStage("Mainnet")
        await authorizeStage("Beta")
        await authorizeStage("Preprod")
    } catch (e) {
        console.error(e)
        return
    }
}

async function authorizeStage(stage: StageName): Promise<void> {
    try {
        // TODO: we can be authorized for multiple stages, but will only have one push notification subscription, so split this function in two parts
        await setSecrets(stage, undefined)

        const privateKey = await getPrivateKey()

        if (privateKey == "") {
            return
        }

        const deviceId = await getDeviceId()

        const secrets = await fetchSecrets(stage, privateKey, deviceId)

        if (!secrets) {
            return
        }

        await setSecrets(stage, secrets)
    } catch (e) {
        console.error(e)
        return
    }
}

export async function isAuthorized(): Promise<string[]> {
    const authorizedStages: string[] = []

    for (let stage of STAGE_NAMES)
        if ((await getSecrets(stage)) != undefined) {
            authorizedStages.push(stage)
        }

    return authorizedStages
}

export async function isSubscribed(): Promise<boolean> {
    return (await getSubscription()) != undefined
}

export async function createSubscription(): Promise<void> {
    try {
        const subscriptionObj = await scope.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: new Uint8Array(
                VAPID_BASE64_CODEC.decode(VAPID_PUBLIC_KEY)
            )
        })

        const subscription = JSON.stringify(subscriptionObj.toJSON())

        await setSubscription(subscription)

        // this is a fresh subscription, so if this fails there is no point in retrying
        await syncSubscription(subscription)
    } catch (e) {
        console.error(e)
    }
}

function convertEd25519ToSchnorrPrivateKey(privateKey: string): number[] {
    const s =
        decodeIntBE(hexToBytes(privateKey)) %
        115792089237316195423570985008687907852837564279074904382605163141518161494337n

    return encodeIntBE(s)
}

// derive Schnorr public key from Ed25519 private key
function deriveSchnorrPublicKey(privateKey: string): string {
    return bytesToHex(
        SchnorrSecp256k1.derivePublicKey(
            convertEd25519ToSchnorrPrivateKey(privateKey)
        )
    )
}

// throws an error if any subscriptions calls failed, in which the caller might retry generation the subscription endpoint
export async function syncSubscription(subscription: string): Promise<void> {
    let fetchFailed = false

    try {
        const privateKey = await getPrivateKey()

        if (privateKey == "") {
            return
        }

        const deviceId = await getDeviceId()

        const isPrimary = await getIsPrimary()

        const schnorrSecp256k1PublicKey = deriveSchnorrPublicKey(privateKey)

        for (let stageName of STAGE_NAMES) {
            const baseUrl = stages[stageName].baseUrl

            try {
                const response = await fetch(`${baseUrl}/subscribe`, {
                    method: "POST",
                    mode: "cors",
                    headers: {
                        Authorization: createAuthToken(privateKey, deviceId)
                    },
                    body: JSON.stringify({
                        subscription,
                        isPrimary,
                        schnorrSecp256k1PublicKey
                    })
                })

                if (!response.ok) {
                    console.log(
                        `Failed to subscribe to ${stageName} push notifications: ${response.statusText}`
                    )
                    fetchFailed = true
                }
            } catch (e) {
                console.error(e)
                fetchFailed = true
            }
        }
    } catch (e) {
        console.error(e)
    }

    if (fetchFailed) {
        throw new Error(
            "subscription failed, the subscription data might be stale"
        )
    }
}
