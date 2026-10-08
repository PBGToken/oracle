import { describe, expect, test } from "bun:test"
import { fetchPbgV2UsdPrice } from "./pbgV2Price.ts"

describe("PBGv2 oracle reference price", () => {
    test("requests the active case-sensitive symbol", async () => {
        const price = await fetchPbgV2UsdPrice(async (url) => {
            expect(new URL(url).searchParams.get("asset")).toBe("PBGv2")
            return Response.json({ fresh: true, asOf: Date.now(), price: 15 })
        })
        expect(price).toBe(15)
    })

    for (const fresh of [false, undefined]) {
        test(`rejects a reference with fresh=${fresh}`, async () => {
            await expect(
                fetchPbgV2UsdPrice(async () =>
                    Response.json({
                        fresh,
                        asOf: Date.now(),
                        price: 15
                    })
                )
            ).rejects.toThrow("stale")
        })
    }

    for (const body of [
        { fresh: true, asOf: Date.now(), price: 0 },
        { fresh: true, asOf: 0, price: 15 }
    ]) {
        test(`rejects invalid reference ${JSON.stringify(body)}`, async () => {
            await expect(
                fetchPbgV2UsdPrice(async () => Response.json(body))
            ).rejects.toThrow("invalid V2 PBG")
        })
    }
})
