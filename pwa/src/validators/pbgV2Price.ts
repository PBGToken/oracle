const PBG_V2_USD_PRICE_URL =
    "https://prices.pbg.io/prices/spot?asset=PBGv2&currency=USD&source=portfolio-registry"

export async function fetchPbgV2UsdPrice(
    fetchPrice: typeof fetch = fetch
): Promise<number> {
    const response = await fetchPrice(PBG_V2_USD_PRICE_URL)

    if (!response.ok) {
        throw new Error(
            `failed to fetch V2 PBG USD price (${response.status} ${response.statusText})`
        )
    }

    const body = (await response.json()) as {
        fresh?: boolean
        asOf: number
        price: number
    }

    if (body.fresh !== true) {
        throw new Error("V2 PBG USD price is stale")
    }
    if (!Number.isFinite(body.price) || body.price <= 0) {
        throw new Error(`invalid V2 PBG USD price ${body.price}`)
    }
    if (!Number.isFinite(body.asOf) || body.asOf <= 0) {
        throw new Error(`invalid V2 PBG USD price timestamp ${body.asOf}`)
    }

    return body.price
}
