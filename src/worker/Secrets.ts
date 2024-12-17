import { encodeBytes, encodeInt, encodeTuple } from "@helios-lang/cbor"
import { bytesToHex, hexToBytes } from "@helios-lang/codec-utils"
import { makeBip32PrivateKey } from "@helios-lang/tx-utils"
import { StageName, stages } from "./stages"

// api keys needed to be able check prices
// for each stage
export type Secrets = {
    blockfrostApiKey: string
}

// undefined return value signifies unauthorized
export async function fetchSecrets(
    stage: StageName,
    privateKey: string,
    deviceId: number
): Promise<Secrets | undefined> {
    const baseUrl = stages[stage].baseUrl

    const response = await fetch(`${baseUrl}/secrets`, {
        method: "GET",
        mode: "cors",
        headers: {
            Authorization: createAuthToken(privateKey, deviceId)
        }
    })

    const data = await response.text()

    return JSON.parse(data) as Secrets // TODO: type-safe
}

export function createAuthToken(privateKey: string, deviceId: number): string {
    const nonce = Date.now() + Math.floor(Math.random() * 1000)

    const message = encodeTuple([encodeInt(nonce), encodeInt(deviceId)])

    const signature = makeBip32PrivateKey(hexToBytes(privateKey)).sign(message)

    const payload = encodeTuple([encodeBytes(message), signature])

    const payloadHex = bytesToHex(payload)

    return payloadHex
}
