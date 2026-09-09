import { describe, expect, test } from "bun:test"
import { normalizeCloudConfig } from "./cloud.ts"

describe("normalizeCloudConfig", () => {
    test("uses AWS for legacy persisted configuration", () => {
        expect(normalizeCloudConfig({})).toEqual({
            provider: "aws",
            netlifyToken: "",
            netlifySiteIds: {},
            vercelToken: "",
            vercelProjectIds: {}
        })
    })

    test("preserves existing providers while adding Vercel defaults", () => {
        expect(
            normalizeCloudConfig({
                provider: "netlify",
                netlifyToken: "saved",
                netlifySiteIds: { Mainnet: "site-1" }
            })
        ).toMatchObject({
            provider: "netlify",
            netlifyToken: "saved",
            netlifySiteIds: { Mainnet: "site-1" },
            vercelToken: "",
            vercelProjectIds: {}
        })
    })
})
