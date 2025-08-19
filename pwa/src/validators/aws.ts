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
    AssetClass,
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
    account_aggregate,
    makeEthereumERC20AccountProvider
} from "@pbgtoken/rwa-contract"
import { StrictType } from "@helios-lang/contract-utils"
import {
    type BitcoinWalletProvider,
    type EthereumERC20AccountProvider
} from "@pbgtoken/rwa-contract"

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

const castAccountAggregateState = account_aggregate.$types.State({
    isMainnet: IS_MAINNET
}) // doesn't matter, only used for type
const castWrappedAssetState = wrapped_asset.$types.State({
    isMainnet: IS_MAINNET
})

type RWADatumWrappedAsset = StrictType<typeof castWrappedAssetState>

type RWADatum =
    | StrictType<typeof castAccountAggregateState>
    | RWADatumWrappedAsset

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

    await validatePrices(tx, cardanoClient)

    return await signCardanoTx(tx)
}

async function validatePrices(
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
            try {
                const pool = findPool(pools, makeAssetClass("."), assetClass)

                const adaPerAsset = pool.getPrice(6, decimals)

                if (
                    Math.abs((price - adaPerAsset) / adaPerAsset) > MAX_REL_DIFF
                ) {
                    validationErrors.push(
                        new Error(
                            `${name} price out of range, expected ~${adaPerAsset.toFixed(6)}, got ${price.toFixed(6)}`
                        )
                    )
                    continue
                }
            } catch (e) {
                if (e instanceof Error && e.message.includes("No pools")) {
                    await validateRWAPrices(
                        cardanoClient,
                        assetClass,
                        price,
                        validationErrors
                    )
                } else {
                    throw e
                }
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

async function validateRWAPrices(
    cardanoClient: BlockfrostV0Client,
    assetClass: AssetClass,
    price: number,
    validationErrors: Error[]
) {
    // it might be an internal bridged asset
    const metadata = await getRWAMetadata(cardanoClient, assetClass)

    // how to verify the price?
    switch (metadata.type) {
        case "WrappedAsset":
            if (!("venue" in metadata)) {
                throw new Error(
                    `venue not specified in metadata of ${assetClass.toString()}`
                )
            }

            switch (metadata.venue) {
                case "Bitcoin":
                    await validateBitcoinRWAPrices(
                        assetClass,
                        metadata,
                        price,
                        validationErrors
                    )
                    break
                case "Ethereum":
                    await validateEthereumRWAPrices(
                        assetClass,
                        metadata,
                        price,
                        validationErrors
                    )
                    break
                default:
                    throw new Error(
                        `unhandled venue '${metadata.venue}' for RWA ${assetClass.toString()}`
                    )
            }

            break
        default:
            throw new Error(
                `only WrappedAsset RWA's supported, got ${metadata.type} for ${assetClass.toString()}`
            )
    }
}

async function validateEthereumRWAPrices(
    assetClass: AssetClass,
    metadata: RWADatumWrappedAsset,
    price: number,
    validationErrors: Error[]
) {
    const provider = makeEthereumERC20AccountProvider(
        metadata.account,
        undefined as any,
        "",
        metadata.policy as `0x${string}`
    ) as EthereumERC20AccountProvider

    const reserves = await provider.getInternalBalance()

    switch (metadata.policy) {
        case "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": // USDC
            await validateWrappedUSDCPrice(
                metadata,
                reserves,
                price,
                validationErrors
            )
            break
        case "0x45804880De22913dAFE09f4980848ECE6EcbAf78": // PAXG
            await validateWrappedPAXGPrice(
                metadata,
                reserves,
                price,
                validationErrors
            )
            break
        default:
            throw new Error(
                `unhandled policy '${metadata.policy}' for RWA ${assetClass.toString()}`
            )
    }
}

async function validateBitcoinRWAPrices(
    assetClass: AssetClass,
    metadata: RWADatumWrappedAsset,
    price: number,
    validationErrors: Error[]
) {
    const provider = makeBitcoinWalletProvider(
        metadata.account,
        undefined as any
    )

    switch (metadata.policy) {
        case "Native":
            await validateWrappedBTCPrice(
                provider,
                metadata,
                price,
                validationErrors
            )
            break
        default:
            throw new Error(
                `unhandled policy '${metadata.policy}' for Bitcoin RWA ${assetClass.toString()}`
            )
    }
}

async function validateWrappedBTCPrice(
    provider: BitcoinWalletProvider,
    metadata: RWADatumWrappedAsset,
    price: number,
    validationErrors: Error[]
) {
    const reserves = BigInt(await provider.getSats())

    await validateWrappedTokenPriceWithCoingecko(
        "bitcoin",
        metadata,
        reserves,
        price,
        validationErrors
    )
}

async function validateWrappedUSDCPrice(
    metadata: RWADatumWrappedAsset,
    reserves: bigint,
    price: number,
    validationErrors: Error[]
) {
    await validateWrappedTokenPriceWithCoingecko(
        "usd-coin",
        metadata,
        reserves,
        price,
        validationErrors
    )
}

async function validateWrappedPAXGPrice(
    metadata: RWADatumWrappedAsset,
    reserves: bigint,
    price: number,
    validationErrors: Error[]
) {
    await validateWrappedTokenPriceWithCoingecko(
        "pax-gold",
        metadata,
        reserves,
        price,
        validationErrors
    )
}

/**
 * @param coinGeckoID
 * @param metadata
 * @param reserves
 * @param price
 * @param validationErrors
 */
async function validateWrappedTokenPriceWithCoingecko(
    coinGeckoID: string,
    metadata: RWADatumWrappedAsset,
    reserves: bigint,
    price: number,
    validationErrors: Error[]
) {
    // get the token price (TODO: all coingecko API calls at once)
    const coinGeckoResponse = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=cardano%2C${coinGeckoID}&vs_currencies=usd`
    )

    const obj = await coinGeckoResponse.json()

    const usdPerAda = obj.cardano.usd
    const usdPerToken = obj[coinGeckoID].usd
    const adaPerToken = usdPerToken / usdPerAda

    const decimals = Number(metadata.decimals)

    // correct for reserves
    const nTokenReserves = Number(reserves) / Math.pow(10, decimals) // assume same decimals are used as in metadata
    const totalValueADA = adaPerToken * nTokenReserves
    const adaPerWrappedToken =
        totalValueADA / (Number(metadata.supply) / Math.pow(10, decimals))

    if (
        Math.abs((price - adaPerWrappedToken) / adaPerWrappedToken) >
        MAX_REL_DIFF
    ) {
        validationErrors.push(
            new Error(
                `${metadata.ticker} price out of range, expected ~${adaPerWrappedToken.toFixed(6)}, got ${price.toFixed(6)}`
            )
        )
    }
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
    /*try {
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
    } catch (_) {*/
    const castDatum = wrapped_asset.$types.Metadata({
        isMainnet: IS_MAINNET
    })
    const datum = expectDefined(data, `not metadata datum for RWA ${ticker}`)

    const state = castDatum.fromUplcData(datum)

    if (state.Cip68.state.type != "WrappedAsset") {
        throw new Error(`unexpected RWA type ${state.Cip68.state.type}`)
    }

    return state.Cip68.state
    //}
}

async function getRWAMetadata(
    cardanoClient: BlockfrostV0Client,
    rwaAssetClass: AssetClass
) {
    const mph = rwaAssetClass.mph
    const tokenName = rwaAssetClass.tokenName

    const ticker = decodeUtf8(tokenName.slice(4))

    const vh = makeValidatorHash(mph.bytes)

    const addr = makeShelleyAddress(IS_MAINNET, vh)

    const metadataAssetClass = makeRWAMetadataAssetClass(mph, ticker)

    const metadataUtxo = expectDefined(
        (
            await cardanoClient.getUtxosWithAssetClass(addr, metadataAssetClass)
        )[0]
    )

    return decodeRWADatum(ticker, metadataUtxo.datum?.data)
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

    const metadata = await getRWAMetadata(cardanoClient, mintedAssetClass)

    switch (metadata.type) {
        /*case "CardanoWallet": {
            if (datum.account.length < 16) {
                // TODO: actually check reserves
                throw new Error("invalid reservesAccount hash")
            }
            break
        }*/
        case "WrappedAsset": {
            if (typeof metadata.account != "string") {
                throw new Error("unexpected accunt format")
            }

            if (!("venue" in metadata)) {
                throw new Error("unexpected datum format")
            }

            let n = 0n
            if (metadata.venue == "Bitcoin") {
                const bitcoinProvider = makeBitcoinWalletProvider(
                    metadata.account,
                    undefined as any
                )

                n = BigInt(await bitcoinProvider.getSats())
            } else if (metadata.venue == "Ethereum") {
                const erc20Provider = makeEthereumERC20AccountProvider(
                    metadata.account,
                    undefined as any,
                    "",
                    metadata.policy as `0x${string}`
                ) as any

                n = await erc20Provider.getInternalBalance()
            } else {
                throw new Error(`unhandled venue ${metadata.venue}`)
            }

            tx.witnesses.redeemers.forEach((redeemer) => {
                if (redeemer.kind == "TxSpendingRedeemer") {
                    const redeemerData = expectConstrData(redeemer.data, 1, 1)
                    const RCardano = expectIntData(redeemerData.fields[0]).value

                    if (RCardano != n) {
                        throw new Error("unexpected reserves in redeemer")
                    }
                }
            })

            break
        }
        default:
            throw new Error(`unrecognized RWA type ${metadata.type}`)
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
        Number(qty) / Math.pow(10, Number(metadata.decimals))
    ).toFixed(6)

    console.log(`minted RWA: ${formattedQty} ${ticker}`)

    return signature
}
