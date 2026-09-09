import { afterEach, describe, expect, test } from "bun:test"
import { deployFunction, deployFunctionIfChanged } from "./useDeployNetlify.ts"

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe("deployFunction", () => {
    test("skips creating a deploy when code and configuration are unchanged", async () => {
        const archive = new Uint8Array([9, 10, 11, 12])
        const digest = await sha256(archive)
        const steps = []

        globalThis.fetch = async () => {
            throw new Error("deploy API must not be called")
        }

        const result = await deployFunctionIfChanged(
            "token",
            {
                id: "site-1",
                account_id: "account-1",
                ssl_url: "https://example.netlify.app",
                url: "http://example.netlify.app",
                published_deploy: {
                    id: "published-deploy",
                    state: "ready",
                    available_functions: [{ n: "validator", d: digest }]
                }
            },
            archive,
            (step) => steps.push(step),
            false
        )

        expect(result).toBe("skipped")
        expect(steps).toEqual([
            "Published validator is unchanged; skipping Netlify deployment"
        ])
    })

    test("publishes when configuration changed despite a matching digest", async () => {
        const archive = new Uint8Array([13, 14, 15, 16])
        const digest = await sha256(archive)
        const requests = []

        globalThis.fetch = async (_url, init = {}) => {
            requests.push(init.method ?? "GET")
            if (requests.length == 1) {
                return jsonResponse({
                    id: "deploy-config",
                    required_functions: []
                })
            }

            return jsonResponse({
                id: "deploy-config",
                state: "ready",
                available_functions: [{ n: "validator", d: digest }]
            })
        }

        const result = await deployFunctionIfChanged(
            "token",
            {
                id: "site-1",
                account_id: "account-1",
                ssl_url: "https://example.netlify.app",
                url: "http://example.netlify.app",
                published_deploy: {
                    id: "published-deploy",
                    state: "ready",
                    available_functions: [{ n: "validator", d: digest }]
                }
            },
            archive,
            () => {},
            true
        )

        expect(result).toBe("deployed")
        expect(requests).toEqual(["POST", "GET"])
    })

    test("recovers when Netlify accepts an upload whose response is unavailable", async () => {
        const archive = new Uint8Array([1, 2, 3, 4])
        const digest = await sha256(archive)
        const requests = []
        const steps = []

        globalThis.fetch = async (_url, init = {}) => {
            requests.push(init.method ?? "GET")

            if (requests.length == 1) {
                return jsonResponse({
                    id: "deploy-1",
                    required_functions: [digest]
                })
            }
            if (requests.length == 2) {
                throw new TypeError("Load failed")
            }

            return jsonResponse({
                id: "deploy-1",
                state: "ready",
                available_functions: [
                    { n: "validator", d: digest, s: archive.byteLength }
                ]
            })
        }

        await deployFunction("token", "site-1", archive, (step) =>
            steps.push(step)
        )

        expect(requests).toEqual(["POST", "PUT", "GET"])
        expect(steps).toContain(
            "Netlify did not return the upload response; verifying the deploy"
        )
    })

    test("rejects a ready deploy when the uploaded function digest is absent", async () => {
        const archive = new Uint8Array([5, 6, 7, 8])
        const digest = await sha256(archive)
        let request = 0

        globalThis.fetch = async () => {
            request++
            if (request == 1) {
                return jsonResponse({
                    id: "deploy-2",
                    required_functions: [digest]
                })
            }
            if (request == 2) throw new TypeError("Load failed")

            return jsonResponse({
                id: "deploy-2",
                state: "ready",
                available_functions: [{ n: "validator", d: "different-digest" }]
            })
        }

        await expect(
            deployFunction("token", "site-1", archive, () => {})
        ).rejects.toThrow("without the expected validator function digest")
    })
})

async function sha256(value) {
    const digest = await crypto.subtle.digest("SHA-256", value)
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
    ).join("")
}

function jsonResponse(value) {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    })
}
