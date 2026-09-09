import { describe, expect, test } from "bun:test"
import JSZip from "jszip"
import { createValidatorZip } from "./usePushAWSLambda.ts"

describe("createValidatorZip", () => {
    test("creates a deterministic compressed function archive", async () => {
        const source = "export const handler = () => 'validator';\n".repeat(
            1000
        )
        const first = await createValidatorZip(source, "validator.js")
        await new Promise((resolve) => setTimeout(resolve, 10))
        const second = await createValidatorZip(source, "validator.js")

        expect(first).toEqual(second)
        expect(first.byteLength).toBeLessThan(source.length)

        const archive = await JSZip.loadAsync(first)
        expect(await archive.file("validator.js").async("string")).toBe(source)
    })
})
