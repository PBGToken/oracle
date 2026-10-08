import { describe, expect, test } from "bun:test"
import { parseRequestBody } from "./requestBody.ts"

describe("parseRequestBody", () => {
    const expected = { kind: "price-update", tx: "00ff" }
    const text = JSON.stringify(expected)

    test("parses an AWS string body", () => {
        expect(parseRequestBody(text)).toEqual(expected)
    })

    test("parses a Vercel Uint8Array body", () => {
        expect(parseRequestBody(new TextEncoder().encode(text))).toEqual(
            expected
        )
    })
})
