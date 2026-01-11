// TODO: generalize to other cloud providers (this function is AWS-specific)
// TODO: make type-safe
import {
    type APIGatewayProxyResult,
    type APIGatewayProxyEventV2
} from "aws-lambda"
import { Effect, Schema } from "effect"
import {
    bytesToHex,
    decodeUtf8,
    encodeUtf8,
    equalsBytes,
    hexToBytes
} from "@helios-lang/codec-utils"
import { Uplc } from "@helios-lang/effect"
import {
    ADA,
    AssetClass,
    convertUplcDataToAssetClass,
    decodeTx,
    makeAssetClass,
    makeShelleyAddress,
    makeValidatorHash,
    MintingPolicyHash,
    TxOutput,
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
import { findPool, getAllV2Pools } from "@helios-lang/minswap"
import {
    expectConstrData,
    expectIntData,
    expectListData,
    UplcData
} from "@helios-lang/uplc"
import {
    makeBitcoinWalletProvider,
    RWAMetadata,
    makeEthereumERC20AccountProvider,
    type BitcoinWalletProvider,
    type EthereumERC20AccountProvider,
    WrappedAssetMetadata,
    SelfReportedAssetMetadata
} from "@pbgtoken/rwa-contract"

type RWAMetadata = Schema.Schema.Type<typeof RWAMetadata>
type RWAState = RWAMetadata["state"]
type WrappedAssetState = Schema.Schema.Type<
    typeof WrappedAssetMetadata
>["state"]
type SelfReportedAssetState = Schema.Schema.Type<
    typeof SelfReportedAssetMetadata
>["state"]

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

type ValidationRequest = {
    kind: "rwa-mint" | "price-update"
    tx: string
}

export async function handler(
    event: APIGatewayProxyEventV2,
    _content: any
): Promise<APIGatewayProxyResult> {
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

// if direct validation fails if these assets, fall back to using Coingecko
const COINGECKO_ASSETS: Record<string, { coingeckoId: string }> = {
    SNEK: {
        coingeckoId: "snek"
    },
    USDM: {
        coingeckoId: "usdm-2"
    },
    WMTX: {
        coingeckoId: "world-mobile-token"
    },
    NIGHT: {
        coingeckoId: "midnight-3"
    }
}

type PriceToValidate = {
    name: string // i.e. the ticker
    assetClass: AssetClass // the on-chain asset class
    price: number // on-chain price that must be validated
    decimals: number
}

async function validatePrices(
    tx: Tx,
    cardanoClient: BlockfrostV0Client
): Promise<void> {
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

    const [pricesToValidate, validationErrors, prices] =
        await collectPricesToValidate(cardanoClient, assetGroupOutputs)

    await tryValidatingWithMinswapPools(
        cardanoClient,
        pricesToValidate,
        validationErrors
    )
    const [coinGeckoPrices, rwas] = await prefetchCoinGeckoPricesAndRWAMetadata(
        cardanoClient,
        pricesToValidate
    )

    // this is sync, no more fetching from network needed
    validateCoinGeckoPrices(coinGeckoPrices, pricesToValidate, validationErrors)

    // this is async because reserves must be fetched from other networks
    await validateRWAPrices(
        coinGeckoPrices,
        rwas,
        pricesToValidate,
        validationErrors
    )

    for (let name in pricesToValidate) {
        validationErrors.push(new Error(`Unable to validate price of ${name}`))
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

async function collectPricesToValidate(
    cardanoClient: BlockfrostV0Client,
    assetGroupOutputs: TxOutput[]
): Promise<[Record<string, PriceToValidate>, Error[], Record<string, number>]> {
    const pricesToValidate: Record<string, PriceToValidate> = {}
    const validationErrors: Error[] = []
    const prices: Record<string, number> = {}

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

            pricesToValidate[name] = {
                name,
                assetClass,
                price,
                decimals
            }
        }
    }

    return [pricesToValidate, validationErrors, prices]
}

/**
 * Removes entries from `pricesToValidate`, and adds errors to `validationErrors`
 * @param cardanoClient
 * @param pricesToValidate
 * @param validationErrors
 */
async function tryValidatingWithMinswapPools(
    cardanoClient: BlockfrostV0Client,
    pricesToValidate: Record<string, PriceToValidate>,
    validationErrors: Error[]
): Promise<void> {
    if (Object.keys(pricesToValidate).length == 0) {
        return
    }

    const pools = await getAllV2Pools(cardanoClient)

    for (let name in pricesToValidate) {
        const { assetClass, price, decimals } = pricesToValidate[name]

        // assume first that the asset is traded on minswap, and look for a minswap pool
        try {
            const pool = findPool(pools, makeAssetClass("."), assetClass)

            const adaPerAsset = pool.getPrice(6, decimals)

            if (Math.abs((price - adaPerAsset) / adaPerAsset) > MAX_REL_DIFF) {
                validationErrors.push(
                    new Error(
                        `${name} price out of range, expected ~${adaPerAsset.toFixed(6)}, got ${price.toFixed(6)}`
                    )
                )
            }

            delete pricesToValidate[name]
        } catch (e) {
            // if minswap pool is found, either something is wrong with minswap (and we fall back to coingecko), or it is an in-house RWA (which will never be traded publicly)
            if (
                e instanceof Error &&
                e.message.toLowerCase().includes("no pools")
            ) {
                console.log(
                    `No minswap pools found for ${name}, verifying using other methods...`
                )
            } else {
                // other error: quit immediately because something else is wrong
                throw e
            }
        }
    }
}

async function prefetchCoinGeckoPricesAndRWAMetadata(
    cardanoClient: BlockfrostV0Client,
    pricesToValidate: Record<string, PriceToValidate>
): Promise<[Record<string, Record<string, number>>, Record<string, RWAState>]> {
    const coinGeckoIDs: Set<string> = new Set(["cardano"])
    const rwas: Record<string, RWAState> = {}

    for (let name in pricesToValidate) {
        if (name in COINGECKO_ASSETS) {
            coinGeckoIDs.add(COINGECKO_ASSETS[name].coingeckoId)
        } else {
            const { assetClass } = pricesToValidate[name]
            const metadata = await getRWAMetadata(cardanoClient, assetClass)

            rwas[name] = metadata

            if (metadata.type == "SelfReportedAsset") {
                // doesn't require a coingecko price
                continue
            }

            // also add coinGeckoIDs for RWA reserves
            coinGeckoIDs.add(getRWACoinGeckoID(metadata, assetClass))
        }
    }

    // fetch all prices from CoinGecko at once
    const coinGeckoResponse = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${Array.from(coinGeckoIDs).join("%2C")}&vs_currencies=usd`
    )

    const responseObj = await coinGeckoResponse.json()

    return [responseObj, rwas]
}

function getRWACoinGeckoID(rwa: RWAState, assetClass: AssetClass): string {
    // how to verify the price?
    switch (rwa.type) {
        case "WrappedAsset":
            if (!("venue" in rwa)) {
                throw new Error(
                    `venue not specified in metadata of ${assetClass.toString()}`
                )
            }

            switch (rwa.venue) {
                case "Bitcoin":
                    switch (rwa.policy) {
                        case "Native":
                            return "bitcoin"
                        default:
                            throw new Error(
                                `unhandled policy '${rwa.policy}' for Bitcoin RWA ${assetClass.toString()}`
                            )
                    }
                case "Ethereum":
                    switch (rwa.policy) {
                        case "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": // USDC
                            return "usd-coin"
                        case "0x45804880De22913dAFE09f4980848ECE6EcbAf78": // PAXG
                            return "pax-gold"
                        default:
                            throw new Error(
                                `unhandled policy '${rwa.policy}' for RWA ${assetClass.toString()}`
                            )
                    }
                default:
                    throw new Error(
                        `unhandled venue '${rwa.venue}' for RWA ${assetClass.toString()}`
                    )
            }
        default:
            throw new Error(
                `only WrappedAsset RWA's supported, got ${rwa.type} for ${assetClass.toString()}`
            )
    }
}

// sync, because prices have been prefetched
function validateCoinGeckoPrices(
    coinGeckoPrices: Record<string, Record<string, number>>,
    pricesToValidate: Record<string, PriceToValidate>,
    validationErrors: Error[]
): void {
    for (let name in pricesToValidate) {
        const { price } = pricesToValidate[name]

        if (name in COINGECKO_ASSETS) {
            validateCoinGeckoPrice(
                coinGeckoPrices,
                name,
                price,
                validationErrors
            )

            delete pricesToValidate[name]
        }
    }
}

async function validateRWAPrices(
    coinGeckoPrices: Record<string, Record<string, number>>,
    rwas: Record<string, RWAState>,
    pricesToValidate: Record<string, PriceToValidate>,
    validationErrors: Error[]
): Promise<void> {
    for (let name in pricesToValidate) {
        const { price, assetClass } = pricesToValidate[name]

        if (name in rwas) {
            const rwa = rwas[name]

            await validateRWAPrice(
                coinGeckoPrices,
                rwa,
                assetClass,
                price,
                validationErrors
            )

            delete pricesToValidate[name]
        }
    }
}

// still async, because we must fetch actual reserves from other chains
async function validateRWAPrice(
    coinGeckoPrices: Record<string, Record<string, number>>,
    metadata: RWAState,
    assetClass: AssetClass,
    price: number,
    validationErrors: Error[]
) {
    // how to verify the price?
    if (metadata.type == "WrappedAsset") {
        switch (metadata.venue) {
            case "Bitcoin":
                await validateBitcoinRWAPrices(
                    coinGeckoPrices,
                    assetClass,
                    metadata,
                    price,
                    validationErrors
                )
                break
            case "Ethereum":
                await validateEthereumRWAPrices(
                    coinGeckoPrices,
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
    } else if (metadata.type == "SelfReportedAsset") {
        switch (metadata.asset) {
            case "SILVER OZ":
                await validateSilverRWAPrice(
                    coinGeckoPrices,
                    metadata,
                    price,
                    validationErrors
                )
                break
        }
    } else {
        throw new Error(
            `only WrappedAsset RWA's supported, got ${metadata.type} for ${assetClass.toString()}`
        )
    }
}

async function validateEthereumRWAPrices(
    coinGeckoPrices: Record<string, Record<string, number>>,
    assetClass: AssetClass,
    metadata: WrappedAssetState,
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
            validateWrappedUSDCPrice(
                coinGeckoPrices,
                metadata,
                reserves,
                price,
                validationErrors
            )
            break
        case "0x45804880De22913dAFE09f4980848ECE6EcbAf78": // PAXG
            validateWrappedPAXGPrice(
                coinGeckoPrices,
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
    coinGeckoPrices: Record<string, Record<string, number>>,
    assetClass: AssetClass,
    metadata: WrappedAssetState,
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
                coinGeckoPrices,
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
    coinGeckoPrices: Record<string, Record<string, number>>,
    metadata: WrappedAssetState,
    price: number,
    validationErrors: Error[]
) {
    const reserves = BigInt(await provider.getSats())

    validateWrappedTokenPriceWithCoingecko(
        coinGeckoPrices,
        "bitcoin",
        metadata,
        reserves,
        8,
        price,
        validationErrors
    )
}

function validateWrappedUSDCPrice(
    coinGeckoPrices: Record<string, Record<string, number>>,
    metadata: WrappedAssetState,
    reserves: bigint,
    price: number,
    validationErrors: Error[]
) {
    validateWrappedTokenPriceWithCoingecko(
        coinGeckoPrices,
        "usd-coin",
        metadata,
        reserves,
        6,
        price,
        validationErrors
    )
}

function validateWrappedPAXGPrice(
    coinGeckoPrices: Record<string, Record<string, number>>,
    metadata: WrappedAssetState,
    reserves: bigint,
    price: number,
    validationErrors: Error[]
) {
    validateWrappedTokenPriceWithCoingecko(
        coinGeckoPrices,
        "pax-gold",
        metadata,
        reserves,
        18,
        price,
        validationErrors
    )
}

async function validateSilverRWAPrice(
    coinGeckoPrices: Record<string, Record<string, number>>,
    metadata: SelfReportedAssetState,
    price: number,
    validationErrors: Error[]
) {
    const usdPerAda = coinGeckoPrices.cardano.usd

    const response = await fetch("https://api.gold-api.com/price/XAG")

    const obj = Schema.decodeUnknownSync(
        Schema.Struct({
            name: Schema.String,
            price: Schema.Number,
            symbol: Schema.String,
            updatedAt: Schema.DateFromString,
            updatedAtReadable: Schema.String
        })
    )(await response.json())

    const usdPerSilverOZ = obj.price

    const adaPerSilverOZ = usdPerSilverOZ / usdPerAda

    if (Math.abs((price - adaPerSilverOZ) / adaPerSilverOZ) > MAX_REL_DIFF) {
        validationErrors.push(
            new Error(
                `${metadata.name} price out of range, expected ~${adaPerSilverOZ.toFixed(3)}, got ${price.toFixed(3)}`
            )
        )
    }
}

function validateCoinGeckoPrice(
    coinGeckoPrices: Record<string, Record<string, number>>,
    name: string,
    price: number,
    validationErrors: Error[]
) {
    const { coingeckoId } = COINGECKO_ASSETS[name]

    const obj = coinGeckoPrices

    const usdPerAda = obj.cardano.usd
    const usdPerToken = obj[coingeckoId].usd
    const adaPerToken = usdPerToken / usdPerAda

    if (Math.abs((price - adaPerToken) / adaPerToken) > MAX_REL_DIFF) {
        validationErrors.push(
            new Error(
                `${name} price out of range, expected ~${adaPerToken.toFixed(6)}, got ${price.toFixed(6)}`
            )
        )
    }
}

/**
 * @param coinGeckoID
 * @param metadata
 * @param reserves
 * @param price
 * @param validationErrors
 */
function validateWrappedTokenPriceWithCoingecko(
    coinGeckoPrices: Record<string, Record<string, number>>,
    coinGeckoID: string,
    metadata: WrappedAssetState,
    reserves: bigint,
    reservesDecimals: number,
    price: number,
    validationErrors: Error[]
) {
    const obj = coinGeckoPrices

    const usdPerAda = obj.cardano.usd
    const usdPerToken = obj[coinGeckoID].usd
    const adaPerToken = usdPerToken / usdPerAda

    const reservesPrecision = Math.pow(10, reservesDecimals)
    const supplyDecimals = Number(metadata.decimals)
    const supplyPrecision = Math.pow(10, supplyDecimals)

    // correct for reserves, reserves can have other number of decimals than supply though
    const nTokenReserves = Number(reserves) / reservesPrecision // assume same decimals are used as in metadata
    const nTokenSupply = Number(metadata.supply) / supplyPrecision

    let adaPerWrappedToken = adaPerToken

    if (nTokenSupply > 0) {
        const totalValueADA =
            adaPerToken * Math.min(nTokenReserves, nTokenSupply)
        adaPerWrappedToken = totalValueADA / nTokenSupply
    }

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

function decodeRWADatum(ticker: string, data: UplcData | undefined): RWAState {
    if (!data) {
        throw new Error(`RWA datum missing for ${ticker}`)
    }

    return Effect.runSync(
        Uplc.Data.decode(data.toCbor()).pipe(
            Effect.flatMap(Schema.decode(RWAMetadata)),
            Effect.map((metadata) => metadata.state)
        )
    )
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

                switch (metadata.policy) {
                    case "Native":
                        n = correctForDecimals(
                            BigInt(await bitcoinProvider.getSats()),
                            8 - Number(metadata.decimals)
                        )
                        break
                    default:
                        throw new Error(
                            `unhandled Bitcoin policy ${metadata.policy}`
                        )
                }
            } else if (metadata.venue == "Ethereum") {
                const erc20Provider = makeEthereumERC20AccountProvider(
                    metadata.account,
                    undefined as any,
                    "",
                    metadata.policy as `0x${string}`
                ) as any

                switch (metadata.policy) {
                    // USDC
                    case "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48":
                        n = correctForDecimals(
                            await erc20Provider.getInternalBalance(),
                            6 - Number(metadata.decimals)
                        )
                        break
                    // PAXG
                    case "0x45804880De22913dAFE09f4980848ECE6EcbAf78":
                        n = correctForDecimals(
                            await erc20Provider.getInternalBalance(),
                            18 - Number(metadata.decimals)
                        )
                        break
                    default:
                        throw new Error(
                            `unhandled Ethereum policy ${metadata.policy}`
                        )
                }
            } else {
                throw new Error(`unhandled venue ${metadata.venue}`)
            }

            tx.witnesses.redeemers.forEach((redeemer) => {
                if (redeemer.kind == "TxSpendingRedeemer") {
                    const redeemerData = expectConstrData(redeemer.data, 1, 1)

                    // RCardano is the number of reserves using supply-side decimals
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

// if p > 0 -> the reserves side uses more decimals than the Cardano side -> make N smaller
// if p < 0 -> the reserves side uses less decimals than the Cardano side -> make N larger
function correctForDecimals(N: bigint, p: number): bigint {
    if (p < 0) {
        return correctForDecimals(N * 10n, p + 1)
    } else if (p > 0) {
        return correctForDecimals(N / 10n, p - 1)
    } else {
        return N
    }
}
