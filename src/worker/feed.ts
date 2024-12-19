import { bytesToHex, hexToBytes } from "@helios-lang/codec-utils"
import { type Tx, type Signature, decodeTx, makeShelleyAddress, convertUplcDataToAssetClass, makeAssetClass } from "@helios-lang/ledger"
import { findPool, getAllV2Pools } from "@helios-lang/minswap"
import { makeBip32PrivateKey, makeBlockfrostV0Client } from "@helios-lang/tx-utils"
import { expectIntData, expectListData } from "@helios-lang/uplc"
import { appendEvent, getDeviceId, getPrivateKey, getSecrets } from "./db"
import { formatPrices } from "./FeedEvent"
import { scope } from "./scope"
import { createAuthToken } from "./Secrets"
import { assertValidStageName, isValidStageName, StageName, stages } from "./stages"

export async function signFeed(stage: string): Promise<void> {
    const privateKey = await getPrivateKey()
    const deviceId = await getDeviceId()

    const tx = await fetchPriceFeed(stage, privateKey, deviceId)

    const prices: Record<string, number> = {}

    try {
        assertValidStageName(stage)

        if (tx) {
            await verifyPrices(tx, stage, prices)

            // sign it
            const pk = makeBip32PrivateKey(hexToBytes(privateKey))

            const id = tx.body.hash()

            const signature = pk.sign(id)

            // upload the signature
            await putSignature(stage, privateKey, deviceId, signature)

            // finally add event to table
            await appendEvent({
                stage,
                hash: bytesToHex(id),
                timestamp: Date.now(),
                prices
            })

            await showNotification(`${stage}, updated prices`, formatPrices(prices))        
        } else {
            throw new Error("unable to fetch Tx from API")
        }
    } catch(e) {
        const errorMessage = (e as Error).message
        await appendEvent({
            stage,
            hash: tx ? bytesToHex(tx.body.hash()) : "NA",
            timestamp: Date.now(),
            prices,
            error: errorMessage
        })

        if (isValidStageName(stage)) {
            return showNotification(`${stage}, failed to update prices`, errorMessage)    
        } else {
            return showNotification("Failed to update prices", errorMessage)
        }
    }
}

async function showNotification(title: string, message: string): Promise<void> {
    const options = {
        icon: "icon.png",
        badge: "badge.png"
    }

    await scope.registration.showNotification(title, {
        ...options,
        body: message
    })
}

async function fetchPriceFeed(
    stage: string,
    privateKey: string,
    deviceId: number
): Promise<Tx | undefined> {
    if (!isValidStageName(stage)) {
        return undefined
    }

    try {
        const baseUrl = stages[stage].baseUrl
        const response = await fetch(`${baseUrl}/feed`, {
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

const USDM_ASSET_CLASS = makeAssetClass("c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad.0014df105553444d")

// hard code USDM for now
async function verifyPrices(tx: Tx, stage: StageName, prices: Record<string, number>): Promise<void> {
    const secrets = await getSecrets(stage)

    if (!secrets) {
        throw new Error("not authorized for stage")
    }

    const addr = makeShelleyAddress(stages[stage].assetsValidatorAddress)

    const assetGroupInputs = tx.body.inputs.filter(input => input.address.isEqual(addr)) 

    if (assetGroupInputs.length == 0) {
        throw new Error("no asset group inputs")
    }

    const assetGroupOutputs = tx.body.outputs.filter(output => output.address.isEqual(addr))

    if (assetGroupOutputs.length != assetGroupInputs.length) {
        throw new Error("number of asset group outputs isn't equal to the number of asset group inputs")
    }

    for (let output of assetGroupOutputs) {
        if (!output.datum) {
            throw new Error("asset group output missing datum")
        }

        if (output.datum.kind != "InlineTxOutputDatum") {
            throw new Error("asset group output doesn't have an inline datum")
        }

        const list = expectListData(output.datum.data)

        for (let assetInfo of list.items) {
            const [assetClassData, _countData, priceData, priceTimeStampData] = expectListData(assetInfo).items

            const assetClass = convertUplcDataToAssetClass(assetClassData)

            const [priceNum, priceDen] = expectListData(priceData).items

            const price = Number(priceNum)/Number(priceDen)

            const priceTimestamp = Number(expectIntData(priceTimeStampData).value)

            // TODO: more scalable mechanism of detecting asset classes
            if (assetClass.isEqual(USDM_ASSET_CLASS)) {
                prices["USDM"] = price // set this for debugging purposes

                if (Math.abs(priceTimestamp - Date.now()) > 5*60_000) {
                    throw new Error(`invalid USDM price timestamp ${new Date(priceTimestamp).toLocaleString()}`)
                }

                
                const cardanoClient = makeBlockfrostV0Client(stage == "Preprod" ? "preprod" : "mainnet", secrets.blockfrostApiKey)
                const pools = await getAllV2Pools(cardanoClient)

                // now fetch the price from minswap
                const pool = findPool(
                    pools,
                    makeAssetClass("."),
                    assetClass
                )

                // TODO: don't hardcode decimals
                const adaPerAsset = pool.getPrice(6, 6)

                if (Math.abs((price - adaPerAsset)/adaPerAsset) > 0.005) {
                    throw new Error(`USDM price out of range, expected ~${adaPerAsset.toFixed(6)}, got ${price.toFixed(6)}`)
                }
            } else {
                throw new Error(`unrecognized asset class ${assetClass.toFingerprint()}`)
            }
        }
    }
}

async function putSignature(
    stage: StageName,
    privateKey: string,
    deviceId: number,
    signature: Signature
): Promise<void> {
    const baseUrl = stages[stage].baseUrl

    try {
        await fetch(`${baseUrl}/feed`, {
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
