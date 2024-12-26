import {
    bytesToHex,
    decodeUtf8,
    encodeUtf8,
    equalsBytes,
    hexToBytes
} from "@helios-lang/codec-utils"
import {
    type Tx,
    type Signature,
    decodeTx,
    makeShelleyAddress,
    convertUplcDataToAssetClass,
    makeAssetClass,
    AssetClass
} from "@helios-lang/ledger"
import { findPool, getAllV2Pools, Pool } from "@helios-lang/minswap"
import {
    BlockfrostV0Client,
    makeBip32PrivateKey,
    makeBlockfrostV0Client
} from "@helios-lang/tx-utils"
import { expectDefined } from "@helios-lang/type-utils"
import {
    expectByteArrayData,
    expectConstrData,
    expectIntData,
    expectListData,
    expectMapData
} from "@helios-lang/uplc"
import { appendEvent, getDeviceId, getPrivateKey, getSecrets } from "./db"
import { formatPrices } from "./FeedEvent"
import { scope } from "./scope"
import { createAuthToken } from "./Secrets"
import {
    assertValidStageName,
    isValidStageName,
    StageName,
    stages
} from "./stages"

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

            await showNotification(
                `${stage}, updated prices`,
                formatPrices(prices)
            )
        } else {
            throw new Error("unable to fetch Tx from API")
        }
    } catch (e) {
        const errorMessage = (e as Error).message
        await appendEvent({
            stage,
            hash: tx ? bytesToHex(tx.body.hash()) : "NA",
            timestamp: Date.now(),
            prices,
            error: errorMessage
        })

        if (isValidStageName(stage)) {
            return showNotification(
                `${stage}, failed to update prices`,
                errorMessage
            )
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

// hard code USDM for now
async function verifyPrices(
    tx: Tx,
    stage: StageName,
    prices: Record<string, number>
): Promise<void> {
    const secrets = await getSecrets(stage)
    const networkName: "preprod" | "mainnet" =
        stage == "Preprod" ? "preprod" : "mainnet"

    if (!secrets) {
        throw new Error("not authorized for stage")
    }

    const addr = makeShelleyAddress(stages[stage].assetsValidatorAddress)

    // it is unnecessary to look at the inputs

    const assetGroupOutputs = tx.body.outputs.filter((output) =>
        output.address.isEqual(addr)
    )

    // a BlockfrostV0Client is used to get minswap price data
    const cardanoClient = makeBlockfrostV0Client(
        networkName,
        secrets.blockfrostApiKey
    )

    let _pools: Pool[] | undefined = undefined

    const getPools = async (): Promise<Pool[]> => {
        if (!_pools) {
            _pools = await getAllV2Pools(cardanoClient)
        }

        return _pools
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
            const [assetClassData, _countData, priceData, priceTimeStampData] =
                expectListData(assetInfo).items

            const assetClass = convertUplcDataToAssetClass(assetClassData)

            const [priceNum, priceDen] = expectListData(priceData).items

            const price = Number(priceNum) / Number(priceDen)

            const priceTimestamp = Number(
                expectIntData(priceTimeStampData).value
            )

            const { ticker: name, decimals } = await getAssetClassInfo(
                cardanoClient,
                assetClass
            )

            prices[name] = price // set this for debugging purposes

            if (Math.abs(priceTimestamp - Date.now()) > 5 * 60_000) {
                throw new Error(
                    `invalid ${name} price timestamp ${new Date(priceTimestamp).toLocaleString()}`
                )
            }

            const pools = await getPools()

            // now fetch the price from minswap
            const pool = findPool(pools, makeAssetClass("."), assetClass)

            const adaPerAsset = pool.getPrice(6, decimals)

            if (Math.abs((price - adaPerAsset) / adaPerAsset) > 0.005) {
                throw new Error(
                    `${name} price out of range, expected ~${adaPerAsset.toFixed(decimals)}, got ${price.toFixed(decimals)}`
                )
            }
        }
    }
}

async function getAssetClassInfo(
    cardanoClient: BlockfrostV0Client,
    assetClass: AssetClass
): Promise<{ ticker: string; decimals: number }> {
    // if the token name starts with the Cip68 (333) prefix, find the corresponding (100) token
    if (equalsBytes(assetClass.tokenName.slice(0, 4), hexToBytes("0014df10"))) {
        try {
            // if this fails, fall back to using metadata service
            const metadataAssetClass = makeAssetClass(
                assetClass.mph,
                hexToBytes("000643b0").concat(assetClass.tokenName.slice(4))
            )

            const metadataAddresses =
                await cardanoClient.getAddressesWithAssetClass(
                    metadataAssetClass
                )

            if (metadataAddresses.length == 1) {
                const { address, quantity } = metadataAddresses[0]

                if (quantity != 1n) {
                    throw new Error("multiple tokens")
                }

                const utxos = await cardanoClient.getUtxosWithAssetClass(
                    address,
                    metadataAssetClass
                )

                if (utxos.length != 1) {
                    throw new Error("multiple utxos")
                }

                const utxo = utxos[0]

                const datum = expectDefined(utxo.datum?.data, "no inline datum")

                const fields = expectConstrData(datum, 0).fields

                const content = expectMapData(
                    expectDefined(fields[0], "bad constrdata first field"),
                    "expected map data"
                )

                const tickerI = content.items.findIndex(([key]) => {
                    return equalsBytes(
                        expectByteArrayData(key).bytes,
                        encodeUtf8("ticker")
                    )
                })

                if (tickerI == -1) {
                    throw new Error("ticker entry not found")
                }

                const decimalsI = content.items.findIndex(([key]) => {
                    return equalsBytes(
                        expectByteArrayData(key).bytes,
                        encodeUtf8("decimals")
                    )
                })

                if (decimalsI == -1) {
                    throw new Error("decimals entry not found")
                }

                const ticker = decodeUtf8(
                    expectByteArrayData(
                        content.items[tickerI][1],
                        "ticker isn't bytearraydata"
                    ).bytes
                )
                const decimals = Number(
                    expectIntData(
                        content.items[decimalsI][1],
                        "decimals isn't IntData"
                    ).value
                )

                return {
                    ticker,
                    decimals
                }
            } else {
                throw new Error("multiple addresses")
            }
        } catch (e: any) {
            console.error(
                `Falling back to CIP26 for ${assetClass.toString()} because there is a CIP68 metadata token error: ${e.message}`
            )
        }
    }

    const baseUrl: string = {
        mainnet: "https://tokens.cardano.org/metadata",
        preprod: "https://metadata.world.dev.cardano.org/metadata", // preprod and preview use the same?
        preview: "https://metadata.world.dev.cardano.org/metadata"
    }[cardanoClient.networkName]

    const url = `${baseUrl}/${assetClass.toString().replace(".", "")}`

    const response = await fetch(url)

    if (!response.ok || response.status == 204) {
        throw new Error(
            `Failed to fetch CIP26 metadata for ${assetClass.toString()}`
        )
    }

    const obj = await response.json()

    const ticker: unknown = expectDefined(
        obj.ticker?.value,
        `${assetClass.toString()} CIP26 ticker.value undefined`
    )
    const decimals: unknown = expectDefined(
        obj.decimals?.value,
        `${assetClass.toString()} CIP26 decimals.value undefined`
    )

    if (typeof ticker != "string") {
        throw new Error(
            `${assetClass.toString()} CIP26 ticker.value isn't a string`
        )
    }

    if (typeof decimals != "number") {
        throw new Error(
            `${assetClass.toString()} CIP26 decimals.value isn't a number`
        )
    }

    return {
        ticker,
        decimals
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
