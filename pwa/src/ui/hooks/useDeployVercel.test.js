import { afterEach, describe, expect, test } from "bun:test"
import {
    createVercelArtifacts,
    deployVercelValidator,
    digestVercelArtifacts
} from "./useDeployVercel.ts"

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe("createVercelArtifacts", () => {
    test("creates a prebuilt Node function around the Lambda handler", async () => {
        const artifacts = await createVercelArtifacts(
            "exports.handler = () => {}"
        )
        const paths = artifacts.map(({ file }) => file)

        expect(paths).toEqual([
            ".vercel/output/config.json",
            ".vercel/output/functions/api/validator.func/index.js",
            ".vercel/output/functions/api/validator.func/.vc-config.json"
        ])
        const functionConfig = JSON.parse(
            new TextDecoder().decode(
                artifacts.find(({ file }) => file.endsWith(".vc-config.json"))
                    .bytes
            )
        )
        expect(functionConfig).toMatchObject({
            runtime: "nodejs22.x",
            handler: "index.js",
            maxDuration: 60,
            launcherType: "Nodejs",
            shouldAddHelpers: false,
            awsLambdaHandler: "index.handler"
        })
        expect(artifacts.every(({ sha }) => /^[0-9a-f]{40}$/.test(sha))).toBe(
            true
        )
        const moved = artifacts.map((artifact, index) =>
            index == 0 ? { ...artifact, file: "config.json" } : artifact
        )
        expect(await digestVercelArtifacts(moved)).not.toBe(
            await digestVercelArtifacts(artifacts)
        )
    })
})

describe("deployVercelValidator", () => {
    test("skips uploads and deployment when production digests match", async () => {
        const requests = []
        const steps = []
        globalThis.fetch = async (url, init = {}) => {
            requests.push({ url: String(url), method: init.method ?? "GET" })
            if (requests.length == 1) {
                return jsonResponse({
                    deployments: [
                        {
                            uid: "deployment-1",
                            readyState: "READY",
                            meta: {
                                pbgValidatorCodeDigest: "code",
                                pbgValidatorConfigDigest: "config"
                            }
                        }
                    ]
                })
            }
            return jsonResponse({
                id: "deployment-1",
                readyState: "READY",
                alias: ["pbg-oracle.vercel.app"]
            })
        }

        const result = await deployVercelValidator({
            token: "token",
            project: { id: "project-1", name: "pbg-oracle" },
            files: await createVercelArtifacts("validator"),
            environment: { PRIVATE_KEY: "private" },
            codeDigest: "code",
            configDigest: "config",
            setStep: (step) => steps.push(step)
        })

        expect(result.alias).toEqual(["pbg-oracle.vercel.app"])
        expect(requests.map(({ method }) => method)).toEqual(["GET", "GET"])
        expect(steps).toContain(
            "Published Vercel validator is unchanged; skipping deployment"
        )
    })

    test("uploads only missing files and creates a production deployment", async () => {
        const artifacts = await createVercelArtifacts("validator")
        const requests = []
        let deploymentAttempt = 0

        globalThis.fetch = async (url, init = {}) => {
            const parsedURL = new URL(String(url))
            const path = parsedURL.pathname
            requests.push({ path, search: parsedURL.search, init })

            if (path == "/v6/deployments") {
                return jsonResponse({ deployments: [] })
            }
            if (path.endsWith("/env") && !init.method) {
                return jsonResponse({ envs: [] })
            }
            if (path.endsWith("/env") && init.method == "POST") {
                return emptyResponse(200)
            }
            if (path == "/v2/files") return jsonResponse({})
            if (path == "/v13/deployments") {
                deploymentAttempt++
                if (deploymentAttempt == 1) {
                    return jsonResponse(
                        {
                            error: {
                                code: "missing_files",
                                missing: artifacts.map(({ sha }) => sha)
                            }
                        },
                        400
                    )
                }
                return jsonResponse({
                    id: "deployment-2",
                    readyState: "READY",
                    alias: ["pbg-oracle.vercel.app"]
                })
            }

            throw new Error(
                `Unexpected request ${init.method ?? "GET"} ${path}`
            )
        }

        const result = await deployVercelValidator({
            token: "token",
            project: { id: "project-1", name: "pbg-oracle" },
            files: artifacts,
            environment: {
                PRIVATE_KEY: "private",
                BLOCKFROST_API_KEY: "blockfrost"
            },
            codeDigest: "new-code",
            configDigest: "new-config",
            setStep: () => {}
        })

        expect(result.id).toBe("deployment-2")
        expect(requests.filter(({ path }) => path == "/v2/files")).toHaveLength(
            3
        )
        const createBodies = requests
            .filter(({ path }) => path == "/v13/deployments")
            .map(({ init }) => JSON.parse(init.body))
        expect(
            requests
                .filter(({ path }) => path == "/v13/deployments")
                .map(({ search }) => search)
        ).toEqual(["?prebuilt=1", "?prebuilt=1"])
        expect(createBodies).toHaveLength(2)
        expect(createBodies[1]).toMatchObject({
            project: "project-1",
            target: "production",
            version: 2,
            projectSettings: { framework: null },
            meta: {
                pbgValidatorCodeDigest: "new-code",
                pbgValidatorConfigDigest: "new-config"
            },
            files: artifacts.map(({ file, bytes, sha }) => ({
                file,
                mode: 0o100644,
                sha,
                size: bytes.byteLength
            }))
        })
        const environmentBody = JSON.parse(
            requests.find(
                ({ path, init }) =>
                    path.endsWith("/env") && init.method == "POST"
            ).init.body
        )
        expect(environmentBody).toEqual([
            {
                key: "PRIVATE_KEY",
                value: "private",
                type: "sensitive",
                target: ["production"]
            },
            {
                key: "BLOCKFROST_API_KEY",
                value: "blockfrost",
                type: "sensitive",
                target: ["production"]
            }
        ])
    })
})

function jsonResponse(value, status = 200) {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" }
    })
}

function emptyResponse(status) {
    return new Response(null, { status })
}
