// TODO: generalize to other cloud providers (this function is AWS-specific)
// TODO: make type-safe
import { type APIGatewayProxyEventV2 } from "aws-lambda"
import {
    bytesToHex,
    decodeUtf8,
    encodeUtf8,
    equalsBytes,
    hexToBytes
} from "@helios-lang/codec-utils"
import {
    ADA,
    convertUplcDataToAssetClass,
    decodeTx,
    makeAssetClass,
    makeShelleyAddress,
    makeValidatorHash,
    MintingPolicyHash,
    type Signature,
    type Tx
} from "@helios-lang/ledger"
import {
    BlockfrostV0Client,
    getAssetClassInfo,
    makeBip32PrivateKey,
    makeBlockfrostV0Client
} from "@helios-lang/tx-utils"
import { expectDefined } from "@helios-lang/type-utils"
import { findPool, getAllV2Pools, Pool } from "@helios-lang/minswap"
import {
    expectConstrData,
    expectIntData,
    expectListData,
    UplcData
} from "@helios-lang/uplc"
import {
    makeBitcoinWalletProvider,
    wrapped_asset,
    account_aggregate
} from "@pbgtoken/rwa-contract"
import { StrictType } from "@helios-lang/contract-utils"

const MAX_REL_DIFF = 0.01 // 1%

const PRIVATE_KEY = expectDefined(
    process.env.PRIVATE_KEY,
    "PRIVATE_KEY not set"
)
const BLOCKFROST_API_KEY = expectDefined(
    process.env.BLOCKFROST_API_KEY,
    "BLOCKFROST_API_KEY not set"
)
const DVP_ASSETS_VALIDATOR_ADDRESS_STRING = expectDefined(
    process.env.DVP_ASSETS_VALIDATOR_ADDRESS,
    "DVP_ASSETS_VALIDATOR_ADDRESS not set"
)

const DVP_ASSETS_VALIDATOR_ADDRESS = makeShelleyAddress(
    DVP_ASSETS_VALIDATOR_ADDRESS_STRING
)

const IS_MAINNET = DVP_ASSETS_VALIDATOR_ADDRESS.mainnet

const castAccountAggregateState = account_aggregate.$types.State({ isMainnet: IS_MAINNET }) // doesn't matter, only used for type
const castWrappedAssetState = wrapped_asset.$types.State({
    isMainnet: IS_MAINNET
})
type RWADatum =
    | StrictType<typeof castAccountAggregateState>
    | StrictType<typeof castWrappedAssetState>

type ValidationRequest = {
    kind: "rwa-mint" | "price-update"
    tx: string
}

export async function handler(
    event: APIGatewayProxyEventV2,
    _content: any
): Promise<any> {
    try {
        const request: ValidationRequest = JSON.parse(
            expectDefined(event.body, "request body undefined")
        )
        const signature = await validateRequest(request)

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "text/plain"
            },
            body: signature
        }
    } catch (e: any) {
        console.error(e.message)
        console.log(e.stack)

        return {
            statusCode: 400,
            headers: {
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                error: e.message
            })
        }
    }
}

// returns a signature as a string (strings can be used to represent different scheme signatures)
async function validateRequest(request: ValidationRequest): Promise<string> {
    switch (request.kind) {
        case "price-update":
        case "rwa-mint": {
            const tx = decodeTx(request.tx)
            const cardanoClient = await makeCardanoClient()
            //await tx.recover(cardanoClient)

            const signature = await (async () => {
                switch (request.kind) {
                    case "price-update":
                        return await validatePriceUpdate(tx, cardanoClient)
                    case "rwa-mint":
                        return await validateRWAMint(tx, cardanoClient)
                }
            })()

            return bytesToHex(signature.toCbor())
        }
        default:
            throw new Error(`unhandled validation request kind ${request.kind}`)
    }
}

async function validatePriceUpdate(
    tx: Tx,
    cardanoClient: BlockfrostV0Client
): Promise<Signature> {
    if (!tx.body.minted.isZero()) {
        throw new Error("unexpected mints/burns")
    }

    await verifyPrices(tx, cardanoClient)

    return await signCardanoTx(tx)
}

async function verifyPrices(
    tx: Tx,
    cardanoClient: BlockfrostV0Client
): Promise<void> {
    const prices: Record<string, number> = {}

    const mintedAssetClasses = tx.body.minted.assetClasses.filter(
        (ac) => !ac.isEqual(ADA)
    )

    if (mintedAssetClasses.length != 0) {
        throw new Error("can't mint while updating price feed")
    }

    // a BlockfrostV0Client is used to get minswap price data

    const addr = makeShelleyAddress(DVP_ASSETS_VALIDATOR_ADDRESS)

    // it is unnecessary to look at the inputs

    const assetGroupOutputs = tx.body.outputs.filter((output) =>
        output.address.isEqual(addr)
    )

    // TODO: other clients
    // can't use demeter utxo rpc because it doesn't set the Access-Control-Allow-Origin to *, and setting up a CORS proxy would allow spoofing the returned data with other price data

    let _pools: Pool[] | undefined = undefined

    const getPools = async (): Promise<Pool[]> => {
        if (!_pools) {
            _pools = await getAllV2Pools(cardanoClient)
        }

        return _pools
    }

    const validationErrors: Error[] = []

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

            // lovelace per (decimal-free) asset
            const priceWithoutDecimals = Number(priceNum) / Number(priceDen)

            const priceTimestamp = Number(
                expectIntData(priceTimeStampData).value
            )

            const { ticker: name, decimals } = await getAssetClassInfo(
                cardanoClient,
                assetClass
            )

            const price = priceWithoutDecimals / Math.pow(10, 6 - decimals)

            prices[name] = price // set this for debugging purposes

            if (Math.abs(priceTimestamp - Date.now()) > 5 * 60_000) {
                validationErrors.push(
                    new Error(
                        `invalid ${name} price timestamp ${new Date(priceTimestamp).toLocaleString()}`
                    )
                )
                continue
            }

            const pools = await getPools()

            // now fetch the price from minswap
            const pool = findPool(pools, makeAssetClass("."), assetClass)

            const adaPerAsset = pool.getPrice(6, decimals)

            if (Math.abs((price - adaPerAsset) / adaPerAsset) > MAX_REL_DIFF) {
                validationErrors.push(
                    new Error(
                        `${name} price out of range, expected ~${adaPerAsset.toFixed(6)}, got ${price.toFixed(6)}`
                    )
                )
                continue
            }
        }
    }

    if (validationErrors.length == 1) {
        throw validationErrors[0]
    } else if (validationErrors.length > 0) {
        throw new Error(validationErrors.map((e) => e.message).join("; "))
    }

    console.log(
        "Validated tx with prices ",
        JSON.stringify(prices, undefined, 4)
    )
}

async function makeCardanoClient(): Promise<BlockfrostV0Client> {
    const networkName: "preprod" | "mainnet" = IS_MAINNET
        ? "mainnet"
        : "preprod"

    // a BlockfrostV0Client is used to get minswap price data
    return makeBlockfrostV0Client(networkName, BLOCKFROST_API_KEY)
}

async function signCardanoTx(tx: Tx): Promise<Signature> {
    const pk = makeBip32PrivateKey(hexToBytes(PRIVATE_KEY))
    const id = tx.body.hash()
    return pk.sign(id)
}

// TODO: import from @pbg/rwa-contract intead
function makeRWAMetadataAssetClass(mph: MintingPolicyHash, ticker: string) {
    return makeAssetClass(
        mph,
        hexToBytes("000643b0").concat(encodeUtf8(ticker))
    )
}

function decodeRWADatum(ticker: string, data: UplcData | undefined): RWADatum {
    try {
        const castDatum = account_aggregate.$types.Metadata({
            isMainnet: IS_MAINNET
        })
        const datum = expectDefined(
            data,
            `not metadata datum for RWA ${ticker}`
        )

        const state = castDatum.fromUplcData(datum)

        if (state.Cip68.state.type != "CardanoWallet") {
            throw new Error(`unexpected RWA type ${state.Cip68.state.type}`)
        }

        return state.Cip68.state
    } catch (_) {
        const castDatum = wrapped_asset.$types.Metadata({
            isMainnet: IS_MAINNET
        })
        const datum = expectDefined(
            data,
            `not metadata datum for RWA ${ticker}`
        )

        const state = castDatum.fromUplcData(datum)

        if (state.Cip68.state.type != "BitcoinNative") {
            throw new Error(`unexpected RWA type ${state.Cip68.state.type}`)
        }

        return state.Cip68.state
    }
}

async function validateRWAMint(
    tx: Tx,
    cardanoClient: BlockfrostV0Client
): Promise<Signature> {
    console.log("validating RWA mint request...")

    const mintedAssetClasses = tx.body.minted.assetClasses.filter(
        (ac) => !ac.isEqual(ADA)
    )

    if (mintedAssetClasses.length != 1) {
        throw new Error("tried to mint more than 1 asset class")
    }

    const mintedAssetClass = mintedAssetClasses[0]
    const qty = tx.body.minted.getAssetClassQuantity(mintedAssetClass)
    const mph = mintedAssetClass.mph
    const tokenName = mintedAssetClass.tokenName

    const ticker = decodeUtf8(tokenName.slice(4))
    const vh = makeValidatorHash(mph.bytes)
    const addr = makeShelleyAddress(IS_MAINNET, vh)
    const metadataAssetClass = makeRWAMetadataAssetClass(mph, ticker)

    const metadataUtxo = expectDefined(
        (
            await cardanoClient.getUtxosWithAssetClass(addr, metadataAssetClass)
        )[0]
    )

    // only one witness allowed, which must be the same validator
    const allScripts = tx.witnesses.allScripts
    if (allScripts.length != 1) {
        throw new Error("only one validator allowed")
    }

    const script = allScripts[0]
    if (!("plutusVersion" in script)) {
        throw new Error("not a UplcProgram")
    }

    if (!equalsBytes(script.hash(), mph.bytes)) {
        throw new Error("script hash bytes not equal to minting policy")
    }

    const datum = decodeRWADatum(ticker, metadataUtxo.datum?.data)

    switch (datum.type) {
        /*case "CardanoWallet": {
            if (datum.account.length < 16) {
                // TODO: actually check reserves
                throw new Error("invalid reservesAccount hash")
            }
            break
        }*/
        case "WrappedAsset": {
            if (typeof datum.account != "string") {
                throw new Error("unexpected accunt format")
            }
            const bitcoinProvider = makeBitcoinWalletProvider(
                datum.account,
                undefined as any
            )

            const sats = BigInt(await bitcoinProvider.getSats())

            tx.witnesses.redeemers.forEach((redeemer) => {
                if (redeemer.kind == "TxSpendingRedeemer") {
                    const redeemerData = expectConstrData(redeemer.data, 1, 1)
                    const RCardano = expectIntData(redeemerData.fields[0]).value

                    if (RCardano != sats) {
                        throw new Error("unexpected reserves in redeemer")
                    }
                }
            })

            break
        }
        default:
            throw new Error(`unrecognized RWA type ${datum.type}`)
    }

    //const bridgeRegistration = await getOldestBridgeRegistration(
    //    cardanoClient,
    //    policy
    //)
    //const bridgeMetadata = await getBridgeMetadata(cardanoClient, policy)
    //
    //assertMetadataCorrespondsToRegistration(bridgeMetadata, bridgeRegistration)
    //
    //const bridgeAddress = makeShelleyAddress(
    //    cardanoClient.isMainnet(),
    //    makeValidatorHash(policy)
    //)
    //
    //const stateAssetClass = makeAssetClass(mph, encodeUtf8("state"))
    //
    //const bridgeStateInputs = tx.body.inputs.filter(
    //    (i) =>
    //        i.value.assets.hasAssetClass(stateAssetClass) &&
    //        i.address.isEqual(bridgeAddress)
    //)
    //if (bridgeStateInputs.length != 1) {
    //    throw new Error("there can only ne one state input")
    //}
    //const oldState = extractBridgeState(bridgeStateInputs[0])
    //
    //const bridgeStateOutputs = tx.body.outputs.filter(
    //    (o) =>
    //        o.value.assets.hasAssetClass(stateAssetClass) &&
    //        o.address.isEqual(bridgeAddress)
    //)
    //if (bridgeStateOutputs.length != 1) {
    //    throw new Error("there can only be one state output")
    //}
    //
    //if (bridgeMetadata.network != "Ethereum") {
    //    throw new Error("not an Ethereum ERC20 bridge")
    //}
    //
    //const contract = await makeERC20Contract(
    //    stage,
    //    bridgeMetadata.networkAssetClass
    //)
    //
    //// get the actual safe reserves reserves
    //const RNetwork = BigInt(
    //    await contract.balanceOf(bridgeRegistration.reservesAddress)
    //)
    //const decimalsNetwork = Number(await contract.decimals())
    //
    //if (tx.witnesses.redeemers.length != 1) {
    //    throw new Error("only one redeemer supported")
    //}
    //
    //const redeemer = tx.witnesses.redeemers[0]
    //const redeemerData = expectConstrData(redeemer.data, 1, 1)
    //const RCardano = expectIntData(redeemerData.fields[0]).value
    //
    //if (RCardano != RNetwork) {
    //    throw new Error(
    //        `invalid redeemer, expected ${RNetwork}, got ${RCardano}`
    //    )
    //}

    // validations complete, the tx can be signed

    const signature = await signCardanoTx(tx)

    const formattedQty = (
        Number(qty) / Math.pow(10, Number(datum.decimals))
    ).toFixed(6)

    console.log(`minted RWA: ${formattedQty} ${ticker}`)

    return signature
}
