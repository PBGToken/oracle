// TODO: generalize to other cloud providers (this function is AWS-specific)
// TODO: make type-safe
import { type APIGatewayProxyEventV2 } from "aws-lambda"
import {
    bytesToHex,
    decodeUtf8,
    encodeUtf8,
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
import { expectIntData, expectListData, UplcData } from "@helios-lang/uplc"
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
    kind: "price-update"
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
        case "price-update": {
            const tx = decodeTx(request.tx)
            const cardanoClient = await makeCardanoClient()

            const signature = await validatePriceUpdate(tx, cardanoClient)

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

const COINBASE_ASSETS: Record<string, { coinbaseSymbol: string }> = {
    // Target: BTC/USD
    BTC: { coinbaseSymbol: "BTC" },
    wBTC: { coinbaseSymbol: "BTC" },

    // Target: ETH/USD
    ETH: { coinbaseSymbol: "ETH" },
    wETH: { coinbaseSymbol: "ETH" },

    // Target: ADA/USD
    ADA: { coinbaseSymbol: "ADA" },
    tADA: { coinbaseSymbol: "ADA" }
}

const COINBASE_API_BASE = "https://api.coinbase.com/v2"

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

    // Fetch Coinbase prices in parallel with Minswap validation for efficiency
    const coinbasePricesPromise = fetchCoinbasePrices()

    await tryValidatingWithMinswapPools(
        cardanoClient,
        pricesToValidate,
        validationErrors
    )

    const coinbasePrices = await coinbasePricesPromise
    validateCoinbasePrices(coinbasePrices, pricesToValidate, validationErrors)

    // Fetch CoinGecko prices for remaining assets
    const [coinGeckoPrices, rwas] = await prefetchCoinGeckoPricesAndRWAMetadata(
        cardanoClient,
        pricesToValidate
    )

    // this is sync, no more fetching from network needed
    validateCoinGeckoPrices(coinGeckoPrices, pricesToValidate, validationErrors)

    // this is async because reserves must be fetched from other networks
    // TODO: remove
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
): Promise<[Record<string, Record<string, number>>, Record<string, RWADatum>]> {
    const coinGeckoIDs: Set<string> = new Set(["cardano"])
    const rwas: Record<string, RWADatum> = {}

    for (let name in pricesToValidate) {
        if (name in COINGECKO_ASSETS) {
            coinGeckoIDs.add(COINGECKO_ASSETS[name].coingeckoId)
        } else {
            const { assetClass } = pricesToValidate[name]
            const metadata = await getRWAMetadata(cardanoClient, assetClass)

            rwas[name] = metadata

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

/**
 * Fetches exchange rates from Coinbase API
 * Returns rates as { BTC: number, ETH: number, ADA: number, ... } where values are tokens per USD
 */
async function fetchCoinbasePrices(): Promise<Record<string, number>> {
    try {
        const response = await fetch(
            `${COINBASE_API_BASE}/exchange-rates?currency=USD`
        )

        if (!response.ok) {
            console.error(
                `Coinbase API error: ${response.status} ${response.statusText}`
            )
            return {}
        }

        const data = await response.json()

        // data.data.rates contains { BTC: "0.000023", ETH: "0.00043", ADA: "2.5", ... }
        const rates: Record<string, number> = {}
        for (const [symbol, rate] of Object.entries(data.data.rates)) {
            rates[symbol] = parseFloat(rate as string)
        }

        return rates
    } catch (e) {
        console.error("Failed to fetch Coinbase prices:", e)
        return {}
    }
}

/**
 * Validates prices using Coinbase exchange rates
 * Removes validated entries from pricesToValidate, adds errors to validationErrors
 */
function validateCoinbasePrices(
    coinbasePrices: Record<string, number>,
    pricesToValidate: Record<string, PriceToValidate>,
    validationErrors: Error[]
): void {
    const adaPerUsd = coinbasePrices["ADA"]
    if (!adaPerUsd || adaPerUsd <= 0) {
        console.log(
            "Coinbase ADA rate not available, skipping Coinbase validation"
        )
        return
    }

    for (let name in pricesToValidate) {
        if (name in COINBASE_ASSETS) {
            const { coinbaseSymbol } = COINBASE_ASSETS[name]
            const tokenPerUsd = coinbasePrices[coinbaseSymbol]

            if (!tokenPerUsd || tokenPerUsd <= 0) {
                console.log(
                    `Coinbase rate for ${coinbaseSymbol} not available, skipping`
                )
                continue
            }

            const { price } = pricesToValidate[name]

            // Calculate ADA per token:
            // adaPerUsd = how many ADA you get for 1 USD
            // tokenPerUsd = how many tokens you get for 1 USD
            // adaPerToken = adaPerUsd / tokenPerUsd
            const adaPerToken = adaPerUsd / tokenPerUsd

            if (Math.abs((price - adaPerToken) / adaPerToken) > MAX_REL_DIFF) {
                validationErrors.push(
                    new Error(
                        `${name} price out of range (Coinbase), expected ~${adaPerToken.toFixed(6)}, got ${price.toFixed(6)}`
                    )
                )
            }

            delete pricesToValidate[name]
            console.log(
                `Validated ${name} price using Coinbase: ${price.toFixed(6)} ADA (expected ~${adaPerToken.toFixed(6)})`
            )
        }
    }
}

function getRWACoinGeckoID(rwa: RWADatum, assetClass: AssetClass): string {
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
    rwas: Record<string, RWADatum>,
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
    metadata: RWADatum,
    assetClass: AssetClass,
    price: number,
    validationErrors: Error[]
) {
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

            break
        default:
            throw new Error(
                `only WrappedAsset RWA's supported, got ${metadata.type} for ${assetClass.toString()}`
            )
    }
}

async function validateEthereumRWAPrices(
    coinGeckoPrices: Record<string, Record<string, number>>,
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
    metadata: RWADatumWrappedAsset,
    price: number,
    validationErrors: Error[]
) {
    const reserves = BigInt(await provider.getSats())

    await validateWrappedTokenPriceWithCoingecko(
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
    metadata: RWADatumWrappedAsset,
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
    metadata: RWADatumWrappedAsset,
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
    metadata: RWADatumWrappedAsset,
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
