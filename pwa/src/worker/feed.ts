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
    AssetClass,
    //makeMintingPolicyHash,
    //makeValidatorHash,
    //ScriptHash,
    //TxOutput,
    //TxInput,
    //ADA,
    makeTxId,
    TxId,
    ADA,
    makeValidatorHash,
    MintingPolicyHash
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
    expectMapData,
    MapData,
    UplcData
    //UplcData
} from "@helios-lang/uplc"
//import {
//    Contract as EthContract,
//    Interface as EthContractInterface,
//    InfuraProvider,
//    Network
//} from "ethers"
//import { createSafeClient, SafeClient } from "@safe-global/sdk-starter-kit"
import {
    appendEvent,
    getDeviceId,
    getIsPrimary,
    getPrivateKey,
    getSecrets,
    setLastHeartbeat
} from "./db"
import { formatPrices } from "./FeedEvent"
import { scope } from "./scope"
import { createAuthToken } from "./Secrets"
import {
    assertValidStageName,
    isValidStageName,
    StageName,
    stages
} from "./stages"
//import { deriveECDSAPrivateKey } from "./auth"

const MAX_REL_DIFF = 0.01 // 1%

export async function handleFeed(
    stage: string,
    heartbeat: boolean,
    timestamp: number | undefined
): Promise<void> {
    try {
        assertValidStageName(stage)

        if (heartbeat) {
            await handleHeartbeat(stage, timestamp)
        } else {
            await handleSign(stage)
        }
    } catch (e) {
        return showNotification(`${stage} failed`, (e as Error).message)
    }
}

async function handleHeartbeat(
    stage: StageName,
    timestamp: number | undefined
): Promise<void> {
    if (await getIsPrimary()) {
        const baseUrl = stages[stage].baseUrl

        const privateKey = await getPrivateKey()
        const deviceId = await getDeviceId()

        const resp = await fetch(`${baseUrl}/pong`, {
            method: "POST",
            mode: "cors",
            headers: {
                Authorization: createAuthToken(privateKey, deviceId)
            },
            body: JSON.stringify({})
        })

        const maybeDiff = resp.ok ? await resp.json() : undefined

        if (timestamp) {
            await setLastHeartbeat(stage, timestamp)
        }

        let diff: undefined | number =
            typeof maybeDiff == "number" && maybeDiff > 0
                ? maybeDiff
                : timestamp
                  ? Date.now() - timestamp
                  : undefined

        if (diff && diff < 0) {
            diff = 0
        }

        await showNotification(
            "Heartbeat",
            `${stage}${timestamp ? `, timestamp=${new Date(timestamp).toLocaleTimeString()} ${new Date(timestamp).toLocaleDateString()}` : ""}${diff ? `, delay=${diff}ms` : ""}`
        )
    }
}

// Any of following can be signed
//   - a price feed update tx (nothing is minted)
//   - a bridge mint tx (something is minted)
//   - a bridge withdrawal tx (bridgeWithdrawal property isn't undefined)
//   - a bridge price correction tx (TODO)
//   - a bridge metadata change (TODO)
async function handleSign(stage: StageName): Promise<void> {
    const privateKey = await getPrivateKey()
    const deviceId = await getDeviceId()

    const tx = await fetchPriceFeed(stage, privateKey, deviceId)

    if (!tx) {
        throw new Error("unable to fetch Tx from API")
    }

    if (tx.body.minted.isZero()) {
        await handleSignDVPPriceUpdate(stage, tx)
    } else {
        await handleSignRWAMint(stage, tx)
    }
}

/*const BRIDGE_REGISTRATION_POLICY = makeMintingPolicyHash("")

type BridgeRegistration = {
    reservesNetwork: string
    reservesAddress: string
    bridgeValidator: ScriptHash
    timestamp: number
}*/

/*function extractBridgeRegistration(
    utxo: TxOutput | TxInput
): BridgeRegistration {
    const rawDatum = expectDefined(
        utxo.datum?.data,
        "registration datum undefined"
    )
    const rawDatumFields = expectListData(rawDatum).items

    const rawReservesNetwork = expectByteArrayData(rawDatumFields[0])
    const rawReservesAddress = expectByteArrayData(rawDatumFields[1])
    const rawBridgeValidator = expectByteArrayData(rawDatumFields[2])
    const rawTimestamp = expectIntData(rawDatumFields[3])

    return {
        reservesNetwork: decodeUtf8(rawReservesNetwork.bytes),
        reservesAddress: decodeUtf8(rawReservesAddress.bytes),
        bridgeValidator: makeMintingPolicyHash(rawBridgeValidator.bytes),
        timestamp: Number(rawTimestamp.value)
    }
}*/

/*async function getOldestBridgeRegistration(
    cardanoClient: BlockfrostV0Client,
    policy: string
): Promise<BridgeRegistration> {
    // look up the registration UTxO
    const registrationAddress = makeShelleyAddress(
        cardanoClient.isMainnet(),
        makeValidatorHash(BRIDGE_REGISTRATION_POLICY.bytes)
    )
    const registrationAssetClass = makeAssetClass(
        BRIDGE_REGISTRATION_POLICY,
        hexToBytes(policy)
    )

    const utxos = await cardanoClient.getUtxosWithAssetClass(
        registrationAddress,
        registrationAssetClass
    )

    if (utxos.length == 0) {
        throw new Error("bridge not yet registered")
    }

    const registrations = utxos.map(extractBridgeRegistration).sort((a, b) => {
        return a.timestamp - b.timestamp
    })

    const registration = registrations[0]

    if (registration.bridgeValidator.toHex() != policy) {
        throw new Error(
            "registration validator doesn't correspond with token name"
        )
    }

    return registration
}*/

/*type BridgeState = {
    tokenPrice: number // number of reserves per token
    tokenSupply: bigint
    totalTokenValue: bigint // equivalent reserves value of all tokens in circulation (e.g. 100 BTC)
}*/

/*function extractBridgeState(utxo: TxOutput | TxInput): BridgeState {
    const rawDatum = expectDefined(
        utxo.datum?.data,
        "registration datum undefined"
    )
    const rawDatumFields = expectListData(rawDatum).items

    const rawTokenPriceRatio = expectListData(rawDatumFields[0])
    const rawTokenSupply = expectIntData(rawDatumFields[1])
    const rawTotalTokenValue = expectIntData(rawDatumFields[2])

    const rawTokenPriceNum = expectIntData(rawTokenPriceRatio.items[0])
    const rawTokenPriceDen = expectIntData(rawTokenPriceRatio.items[1])

    return {
        tokenPrice: Number(rawTokenPriceNum.value) / Number(rawTokenPriceDen),
        tokenSupply: rawTokenSupply.value,
        totalTokenValue: rawTotalTokenValue.value
    }
}*/

/*async function getBridgeState(
    cardanoClient: BlockfrostV0Client,
    policy: string
): Promise<BridgeState> {
    const bridgeAddress = makeShelleyAddress(
        cardanoClient.isMainnet(),
        makeValidatorHash(policy)
    )

    const bridgeStateTokenName = encodeUtf8("state")
    const bridgeAssetClass = makeAssetClass(
        makeMintingPolicyHash(policy),
        bridgeStateTokenName
    )

    const utxos = await cardanoClient.getUtxosWithAssetClass(
        bridgeAddress,
        bridgeAssetClass
    )

    if (utxos.length == 0) {
        throw new Error("bridge not yet initialized")
    } else if (utxos.length > 1) {
        throw new Error("too many bridge state tokens")
    }

    return extractBridgeState(utxos[0])
}*/

// TODO: fill with other details
/*type BridgeMetadata = {
    name: string
    description: string
    decimals: number
    ticker: string
    network: string
    networkAssetClass: string
    networkReservesAddress: string
}*/

/*function extractBridgeMetadata(utxo: TxInput | TxOutput): BridgeMetadata {
    const rawDatum = expectDefined(utxo.datum?.data)

    const rawMap = expectMapData(expectConstrData(rawDatum, 0, 3).fields[0])

    const getEntry = (sKey: string): UplcData => {
        return expectDefined(
            rawMap.items.find(
                ([key, _]) => decodeUtf8(expectByteArrayData(key).bytes) == sKey
            )
        )[0]
    }

    const getStringEntry = (sKey: string): string => {
        return decodeUtf8(expectByteArrayData(getEntry(sKey)).bytes)
    }

    const getIntEntry = (sKey: string): number => {
        return Number(expectIntData(getEntry(sKey)).value)
    }

    const name = getStringEntry("name")
    const ticker = getStringEntry("ticker")
    const description = getStringEntry("description")
    const decimals = getIntEntry("decimals")
    const network = getStringEntry("network")
    const networkAssetClass = getStringEntry("asset_class")
    const networkReservesAddress = getStringEntry("reserves_address")

    return {
        name,
        description,
        decimals,
        ticker,
        network,
        networkAssetClass,
        networkReservesAddress
    }
}*/

/*async function getBridgeMetadata(
    cardanoClient: BlockfrostV0Client,
    policy: string
): Promise<BridgeMetadata> {
    const bridgeAddress = makeShelleyAddress(
        cardanoClient.isMainnet(),
        makeValidatorHash(policy)
    )

    const mph = makeMintingPolicyHash(policy)
    const utxos = await cardanoClient.getUtxos(bridgeAddress)

    if (utxos.length < 2) {
        throw new Error("expected at least 2 utxos at bridge address")
    }

    const utxo = expectDefined(
        utxos.find((utxo) =>
            utxo.value.assets.assetClasses.some(
                (ac) =>
                    ac.mph.isEqual(mph) && decodeUtf8(ac.tokenName) != "state"
            )
        ),
        "metadata utxo not found"
    )

    const metadata = extractBridgeMetadata(utxo)

    return metadata
}*/

// TODO: can the metadata UTxO and the registration UTxO be merged?
/*function assertMetadataCorrespondsToRegistration(
    metadata: BridgeMetadata,
    registration: BridgeRegistration
): void {
    if (metadata.network != registration.reservesNetwork) {
        throw new Error(
            "metadata network doesn't correspond to registration network"
        )
    }

    if (metadata.networkReservesAddress != registration.reservesAddress) {
        throw new Error(
            "metadata network reserves address doesn't correspond to registration reserves address"
        )
    }
}*/

/*async function handleSignBridgeWithdrawal(
    stage: StageName,
    rawBridgeWithdrawal: unknown
): Promise<void> {
    // the BridgeWithdrawal structure hasn't been verified at this point
    const bridgeWithdrawal = expectBridgeWithdrawal(rawBridgeWithdrawal)

    const cardanoClient = await makeCardanoClient(stage)
    const bridgeRegistration = await getOldestBridgeRegistration(
        cardanoClient,
        bridgeWithdrawal.policy
    )
    const bridgeState = await getBridgeState(
        cardanoClient,
        bridgeWithdrawal.policy
    )
    const bridgeMetadata = await getBridgeMetadata(
        cardanoClient,
        bridgeWithdrawal.policy
    )

    assertMetadataCorrespondsToRegistration(bridgeMetadata, bridgeRegistration)

    switch (bridgeRegistration.reservesNetwork) {
        case "Ethereum":
            await handleSignEthereumBridgeWithdrawal(
                stage,
                bridgeRegistration,
                bridgeMetadata,
                bridgeState,
                bridgeWithdrawal
            )
            break
        default:
            throw new Error(
                `unhandled bridge network ${bridgeRegistration.reservesNetwork}`
            )
    }
}*/

/*async function makeERC20Contract(
    stage: StageName,
    policy: string
): Promise<EthContract> {
    const secrets = expectDefined(
        await getSecrets(stage),
        "secrets not yet set"
    )

    const client = new InfuraProvider(
        "mainnet",
        expectDefined(secrets.infuraRpcApiKey),
        expectDefined(secrets.infuraRpcApiSecret)
    )

    const erc20Interface = new EthContractInterface([
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function transfer(address to, uint256 amount) public returns (bool)"
    ])

    return new EthContract(policy, erc20Interface, client)
}*/

/*async function makeEthereumSafe(
    stage: StageName,
    reservesAddress: string
): Promise<SafeClient> {
    const secrets = expectDefined(
        await getSecrets(stage),
        "secrets not yet set"
    )
    const providerURL = InfuraProvider.getRequest(
        Network.from("mainnet"),
        expectDefined(secrets.infuraRpcApiKey),
        expectDefined(secrets.infuraRpcApiSecret)
    ).url
    const ecdsaPrivateKey = deriveECDSAPrivateKey(await getPrivateKey())

    return await createSafeClient({
        provider: providerURL,
        signer: ecdsaPrivateKey,
        safeAddress: reservesAddress
    })
}*/

/*async function handleSignEthereumBridgeWithdrawal(
    stage: StageName,
    bridgeRegistration: BridgeRegistration,
    bridgeMetadata: BridgeMetadata,
    bridgeState: BridgeState,
    bridgeWithdrawal: BridgeWithdrawal
): Promise<void> {
    const safeClient = await makeEthereumSafe(
        stage,
        bridgeRegistration.reservesAddress
    )

    // get the pending transaction
    const pending = await safeClient.getPendingTransactions()
    const tx = pending.results.find(
        (tx) => tx.safeTxHash == bridgeWithdrawal.txId
    )

    if (!tx) {
        throw new Error(
            `no pending multisig transaction found with hash ${bridgeWithdrawal.txId}`
        )
    }

    if (bridgeMetadata.networkAssetClass == "") {
        throw new Error("ETH withdrawals not yet handled")
    }

    if (tx.to != bridgeMetadata.networkAssetClass) {
        throw new Error("not sent to registered ERC-20 address")
    }

    if (parseFloat(tx.value) != 0.0) {
        throw new Error("unexpected ETH sent")
    }

    const contract = await makeERC20Contract(
        stage,
        bridgeMetadata.networkAssetClass
    )

    const decimalsNetwork = Number(await contract.decimals())
    const R = BigInt(
        await contract.balanaceOf(bridgeRegistration.reservesAddress)
    )
    const result = contract.interface.decodeFunctionData(
        "transfer",
        expectDefined(tx.data)
    )
    const w = BigInt(result[1])
    const V = bridgeState.totalTokenValue

    if (!(w <= R - V)) {
        throw new Error(
            `too much withdrawn (can withdraw ${R - V}, trying to withdraw ${w})`
        )
    }

    const txResult = await safeClient.confirm({
        safeTxHash: bridgeWithdrawal.txId
    })

    console.log(txResult.status)

    await appendEvent({
        stage,
        hash: bridgeWithdrawal.txId,
        timestamp: Date.now(),
        prices: {}
    })

    await showNotification(
        `${stage}, signed bridge mint`,
        `withdrew ${(Number(w) / Math.pow(10, decimalsNetwork)).toFixed(2)} ${bridgeMetadata.ticker}`
    )
}*/

/*function expectBridgeWithdrawal(bw: any): BridgeWithdrawal {
    if (bw == null || typeof bw != "object") {
        throw new Error("undefined or not an object")
    }

    if (!("policy" in bw)) {
        throw new Error("policy not found")
    }

    if (typeof bw.policy != "string") {
        throw new Error("policy not a string")
    }

    if (!("txId" in bw)) {
        throw new Error("txId not found")
    }

    if (typeof bw.txId != "string") {
        throw new Error("txId not a string")
    }

    return bw
}*/

async function handleSignRWAMint(stage: StageName, tx: Tx): Promise<void> {
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
    const addr = makeShelleyAddress(stage == "Preprod" ? false : true, vh)
    const metadataAssetClass = makeRWAMetadataAssetClass(mph, ticker)

    const cardanoClient = await makeCardanoClient(stage)

    const metadataUtxo = expectDefined(
        (
            await cardanoClient.getUtxosWithAssetClass(addr, metadataAssetClass)
        )[0]
    )

    const datum = decodeRWADatum(ticker, metadataUtxo.datum?.data)

    if (datum.reservesAccount.length < 16) {
        // TODO: actually check reserves
        throw new Error("invalid reservesAccount hash")
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

    const id = await signCardanoTx(stage, tx)

    const formattedQty = (Number(qty) / Math.pow(10, 6)).toFixed(6)

    // finally add event to table
    await appendEvent({
        stage,
        hash: id.toHex(),
        timestamp: Date.now(),
        prices: {},
        message: `minted RWA:  ${ticker}`
    })

    await showNotification(
        `${stage}, signed RWA mint`,
        `minted ${formattedQty} ${ticker}`
    )
}

async function signCardanoTx(stage: StageName, tx: Tx): Promise<TxId> {
    const privateKey = await getPrivateKey()
    const deviceId = await getDeviceId()

    const pk = makeBip32PrivateKey(hexToBytes(privateKey))
    const id = tx.body.hash()
    const signature = pk.sign(id)

    await putSignature(stage, privateKey, deviceId, signature)

    return makeTxId(id)
}

async function handleSignDVPPriceUpdate(
    stage: StageName,
    tx: Tx
): Promise<void> {
    const prices: Record<string, number> = {}

    try {
        if (tx) {
            await verifyPrices(tx, stage, prices)

            const id = await signCardanoTx(stage, tx)

            // finally add event to table
            await appendEvent({
                stage,
                hash: id.toHex(),
                timestamp: Date.now(),
                prices,
                message: "updated prices"
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

export async function showNotification(
    title: string,
    message: string
): Promise<void> {
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
        throw new Error(`invalid stage name ${stage}`)
    }

    const baseUrl = stages[stage].baseUrl

    const response = await fetch(`${baseUrl}/feed`, {
        method: "GET",
        mode: "cors",
        headers: {
            Authorization: createAuthToken(privateKey, deviceId)
        }
    })

    if (response.ok) {
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
}

async function makeCardanoClient(
    stage: StageName
): Promise<BlockfrostV0Client> {
    const secrets = await getSecrets(stage)
    const networkName: "preprod" | "mainnet" =
        stage == "Preprod" ? "preprod" : "mainnet"

    if (!secrets) {
        throw new Error("not authorized for stage")
    }

    // a BlockfrostV0Client is used to get minswap price data
    return makeBlockfrostV0Client(networkName, secrets.blockfrostApiKey)
}

// hard code USDM for now
async function verifyPrices(
    tx: Tx,
    stage: StageName,
    prices: Record<string, number>
): Promise<void> {
    // a BlockfrostV0Client is used to get minswap price data
    const cardanoClient = await makeCardanoClient(stage)

    const addr = makeShelleyAddress(stages[stage].assetsValidatorAddress)

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
}

// TODO: use Demeter UtxO client
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

function makeRWAMetadataAssetClass(mph: MintingPolicyHash, ticker: string) {
    return makeAssetClass(
        mph,
        hexToBytes("000643b0").concat(encodeUtf8(ticker))
    )
}

function decodeRWADatum(ticker: string, data: UplcData | undefined): RWADatum {
    const datum = expectDefined(data, `not metadata datum for RWA ${ticker}`)

    const state = expectMapData(expectConstrData(datum).fields[0])

    const supply = expectIntData(
        getCip68Entry(ticker, state, "current_supply")
    ).value
    const last_mint_supply = expectIntData(
        getCip68Entry(ticker, state, "last_mint_supply")
    ).value
    const last_deposit_or_withdrawal = expectByteArrayData(
        getCip68Entry(ticker, state, "last_deposit_or_withdrawal")
    ).bytes
    const reservesAccount = expectByteArrayData(
        getCip68Entry(ticker, state, "reserves_account")
    ).bytes

    return {
        current_supply: supply,
        last_mint_supply: last_mint_supply,
        last_deposit_or_withdrawal_tx: last_deposit_or_withdrawal,
        reservesAccount
    }
}

function getCip68Entry(ticker: string, map: MapData, key: string): UplcData {
    const entry = expectDefined(
        map.items.find((item) => {
            return decodeUtf8(expectByteArrayData(item[0]).bytes) == key
        }),
        `${key} entry not found in datum of RWA ${ticker}`
    )

    return entry[1]
}

type RWADatum = {
    current_supply: bigint
    last_mint_supply: bigint
    last_deposit_or_withdrawal_tx: number[]
    reservesAccount: number[]
}
