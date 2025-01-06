import { makeBase64 } from "@helios-lang/codec-utils"
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

        await syncSubscription(subscription)
    } catch (e) {
        console.error(e)
    }
}

export async function syncSubscription(subscription: string) {
    try {
        const privateKey = await getPrivateKey()

        if (privateKey == "") {
            return
        }

        const deviceId = await getDeviceId()

        const isPrimary = await getIsPrimary()

        for (let stageName of STAGE_NAMES) {
            const baseUrl = stages[stageName].baseUrl

            const response = await fetch(`${baseUrl}/subscribe`, {
                method: "POST",
                mode: "cors",
                headers: {
                    Authorization: createAuthToken(privateKey, deviceId)
                },
                body: JSON.stringify({ subscription, isPrimary })
            })

            if (!response.ok) {
                console.log(
                    `Failed to subscribe to ${stageName} push notifications: ${response.statusText}`
                )
            }
        }
    } catch (e) {
        console.error(e)
    }
}
