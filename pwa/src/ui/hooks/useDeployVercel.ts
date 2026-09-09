import { useState } from "react"
import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import { bytesToHex, encodeUtf8 } from "@helios-lang/codec-utils"
import { useCloudConfig } from "./useCloudConfig"
import { deriveSchnorrPublicKey } from "./keys"
import { usePrivateKey } from "./usePrivateKey"
import {
    fetchPlatformSecrets,
    getValidatorJS,
    syncFunctionURL
} from "./usePushAWSLambda"
import { type StageName, stages } from "./stages"

const API_URL = "https://api.vercel.com"
const DEPLOY_TIMEOUT_MS = 5 * 60_000
const POLL_INTERVAL_MS = 2_000
const FILE_MODE = 0o100644
const CODE_DIGEST_META = "pbgValidatorCodeDigest"
const CONFIG_DIGEST_META = "pbgValidatorConfigDigest"

type DeployVercelArgs = {
    stage: StageName
}

type VercelProject = {
    id: string
    name: string
}

type VercelDeployment = {
    id?: string
    uid?: string
    url?: string
    alias?: string[]
    aliasAssigned?: boolean
    readyState?: string
    state?: string
    status?: string
    errorCode?: string
    errorMessage?: string
    meta?: Record<string, string>
}

type VercelFile = {
    file: string
    bytes: Uint8Array
    sha: string
}

type PreparedVercelFile = {
    file: string
    mode: number
    sha: string
    size: number
}

type VercelEnvironmentVariable = {
    id: string
    key: string
}

export type DeployVercelResult = UseMutationResult<
    void,
    Error,
    DeployVercelArgs,
    undefined
> & {
    deploymentStep: string
}

export function useDeployVercel(): DeployVercelResult {
    const [cloudConfig, saveCloudConfig] = useCloudConfig()
    const [privateKey] = usePrivateKey()
    const [deploymentStep, setDeploymentStep] = useState("")

    const mutation = useMutation<void, Error, DeployVercelArgs, undefined>({
        mutationKey: ["vercel-deploy"],
        mutationFn: async ({ stage }) => {
            setDeploymentStep("Checking deployment configuration")
            if (!cloudConfig.vercelToken || !privateKey) {
                throw new Error(
                    "Vercel and oracle credentials must be configured"
                )
            }

            const token = cloudConfig.vercelToken
            const stageConfig = stages[stage]
            const secrets = await runDeploymentStep(
                "Fetching validator secrets from PBG",
                setDeploymentStep,
                () => fetchPlatformSecrets(stageConfig.baseUrl, privateKey)
            )
            const project = await runDeploymentStep(
                "Finding or creating the Vercel project",
                setDeploymentStep,
                () =>
                    getOrCreateProject(
                        token,
                        cloudConfig.vercelProjectIds[stage],
                        stage,
                        privateKey
                    )
            )

            if (cloudConfig.vercelProjectIds[stage] !== project.id) {
                await runDeploymentStep(
                    "Saving the Vercel project ID",
                    setDeploymentStep,
                    () =>
                        saveCloudConfig.mutateAsync({
                            ...cloudConfig,
                            vercelProjectIds: {
                                ...cloudConfig.vercelProjectIds,
                                [stage]: project.id
                            }
                        })
                )
            }

            const validatorJS = await runDeploymentStep(
                "Preparing the Vercel validator function",
                setDeploymentStep,
                getValidatorJS
            )
            const environment = {
                PRIVATE_KEY: privateKey,
                BLOCKFROST_API_KEY: secrets.blockfrostApiKey,
                DVP_ASSETS_VALIDATOR_ADDRESS: stageConfig.assetsValidatorAddress
            }
            const artifacts = await createVercelArtifacts(validatorJS)
            const codeDigest = await digestVercelArtifacts(artifacts)
            const configDigest = await sha256(
                new Uint8Array(encodeUtf8(canonicalEnvironment(environment)))
            )
            const deployment = await runDeploymentStep(
                `Deploying the validator to Vercel project ${project.id}`,
                setDeploymentStep,
                () =>
                    deployVercelValidator({
                        token,
                        project,
                        files: artifacts,
                        environment,
                        codeDigest,
                        configDigest,
                        setStep: setDeploymentStep
                    })
            )
            const endpoint = `${getProductionURL(project, deployment)}/api/validator`

            await runDeploymentStep(
                `Verifying ${endpoint}`,
                setDeploymentStep,
                () => waitForValidatorEndpoint(endpoint)
            )
            await runDeploymentStep(
                "Registering the validator endpoint with PBG",
                setDeploymentStep,
                () => syncFunctionURL(endpoint, stageConfig.baseUrl, privateKey)
            )
            setDeploymentStep("Deployment complete")
        }
    })

    return Object.assign(mutation, { deploymentStep })
}

export async function createVercelArtifacts(
    validatorJS: string
): Promise<VercelFile[]> {
    const rawFiles = [
        {
            file: ".vercel/output/config.json",
            bytes: new Uint8Array(encodeUtf8(JSON.stringify({ version: 3 })))
        },
        {
            file: ".vercel/output/functions/api/validator.func/index.js",
            bytes: new Uint8Array(encodeUtf8(validatorJS))
        },
        {
            file: ".vercel/output/functions/api/validator.func/.vc-config.json",
            bytes: new Uint8Array(
                encodeUtf8(
                    JSON.stringify({
                        runtime: "nodejs22.x",
                        handler: "index.js",
                        maxDuration: 60,
                        launcherType: "Nodejs",
                        shouldAddHelpers: false,
                        awsLambdaHandler: "index.handler"
                    })
                )
            )
        }
    ]

    return Promise.all(
        rawFiles.map(async (file) => ({
            ...file,
            sha: await sha1(file.bytes)
        }))
    )
}

export function digestVercelArtifacts(
    artifacts: VercelFile[]
): Promise<string> {
    return sha256(
        concatBytes(
            artifacts.flatMap(({ file, bytes }) => [
                new Uint8Array(encodeUtf8(`${file}\0`)),
                bytes
            ])
        )
    )
}

export async function deployVercelValidator({
    token,
    project,
    files,
    environment,
    codeDigest,
    configDigest,
    setStep
}: {
    token: string
    project: VercelProject
    files: VercelFile[]
    environment: Record<string, string>
    codeDigest: string
    configDigest: string
    setStep: (step: string) => void
}): Promise<VercelDeployment> {
    const current = await getLatestProductionDeployment(token, project.id)
    if (
        isReady(current) &&
        current?.meta?.[CODE_DIGEST_META] == codeDigest &&
        current.meta[CONFIG_DIGEST_META] == configDigest
    ) {
        setStep("Published Vercel validator is unchanged; skipping deployment")
        return getDeployment(token, deploymentId(current))
    }

    if (current?.meta?.[CONFIG_DIGEST_META] != configDigest) {
        setStep("Updating sensitive Vercel environment variables")
        await setEnvironmentVariables(token, project.id, environment)
    }

    const preparedFiles: PreparedVercelFile[] = files.map(
        ({ file, bytes, sha }) => ({
            file,
            mode: FILE_MODE,
            sha,
            size: bytes.byteLength
        })
    )
    const request = {
        name: project.name,
        project: project.id,
        version: 2,
        target: "production",
        source: "cli",
        files: preparedFiles,
        projectSettings: { framework: null },
        meta: {
            [CODE_DIGEST_META]: codeDigest,
            [CONFIG_DIGEST_META]: configDigest
        }
    }

    setStep("Checking which Vercel artifacts require upload")
    let response = await createDeployment(token, request)
    if (response.missing.length > 0) {
        const missing = new Set(response.missing)
        const uploads = files.filter(({ sha }) => missing.has(sha))
        setStep(`Uploading ${uploads.length} Vercel deployment artifact(s)`)
        await Promise.all(uploads.map((file) => uploadFile(token, file)))
        response = await createDeployment(token, request)
    }

    if (!response.deployment) {
        throw new Error("Vercel did not create a deployment after file upload")
    }

    return waitForDeployment(token, response.deployment, setStep)
}

async function getOrCreateProject(
    token: string,
    savedProjectId: string | undefined,
    stage: StageName,
    privateKey: string
): Promise<VercelProject> {
    const fingerprint = deriveSchnorrPublicKey(privateKey)
        .slice(0, 12)
        .toLowerCase()
    const projectName = `pbg-oracle-${stage.toLowerCase()}-${fingerprint}`

    if (savedProjectId) {
        try {
            return await vercelFetch<VercelProject>(
                token,
                `/v9/projects/${encodeURIComponent(savedProjectId)}`
            )
        } catch (error) {
            if (
                !(error instanceof Error) ||
                !error.message.includes("HTTP 404")
            ) {
                throw error
            }
        }
    }

    try {
        return await vercelFetch<VercelProject>(
            token,
            `/v9/projects/${encodeURIComponent(projectName)}`
        )
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("HTTP 404")) {
            throw error
        }
    }

    return vercelFetch<VercelProject>(token, "/v11/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: projectName,
            framework: null
        })
    })
}

async function setEnvironmentVariables(
    token: string,
    projectId: string,
    values: Record<string, string>
): Promise<void> {
    const { envs = [] } = await vercelFetch<{
        envs?: VercelEnvironmentVariable[]
    }>(token, `/v10/projects/${encodeURIComponent(projectId)}/env`)
    const existing = new Map(envs.map((variable) => [variable.key, variable]))
    const missing: {
        key: string
        value: string
        type: string
        target: string[]
    }[] = []
    const updates: Promise<void>[] = []

    for (const [key, value] of Object.entries(values)) {
        const variable = existing.get(key)
        const body = { key, value, type: "sensitive", target: ["production"] }
        if (variable) {
            updates.push(
                vercelFetch<void>(
                    token,
                    `/v10/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(variable.id)}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body)
                    }
                )
            )
        } else {
            missing.push(body)
        }
    }

    if (missing.length > 0) {
        updates.push(
            vercelFetch<void>(
                token,
                `/v10/projects/${encodeURIComponent(projectId)}/env`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(missing)
                }
            )
        )
    }

    await Promise.all(updates)
}

async function getLatestProductionDeployment(
    token: string,
    projectId: string
): Promise<VercelDeployment | undefined> {
    const result = await vercelFetch<{ deployments?: VercelDeployment[] }>(
        token,
        `/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=1`
    )
    return result.deployments?.[0]
}

async function createDeployment(
    token: string,
    body: object
): Promise<{ deployment?: VercelDeployment; missing: string[] }> {
    const response = await vercelRequest(token, "/v13/deployments?prebuilt=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    })
    const result = (await response.json()) as VercelDeployment & {
        error?: { code?: string; message?: string; missing?: string[] }
    }

    if (response.ok && !result.error) {
        return { deployment: result, missing: [] }
    }
    if (result.error?.code == "missing_files") {
        return { missing: result.error.missing ?? [] }
    }

    throw vercelResponseError(response, result.error ?? result)
}

async function uploadFile(token: string, file: VercelFile): Promise<void> {
    await vercelFetch<void>(token, "/v2/files", {
        method: "POST",
        headers: {
            "Content-Type": "application/octet-stream",
            "x-vercel-digest": file.sha
        },
        body: file.bytes
    })
}

async function waitForDeployment(
    token: string,
    initial: VercelDeployment,
    setStep: (step: string) => void
): Promise<VercelDeployment> {
    const startedAt = Date.now()
    let deployment = initial

    while (Date.now() - startedAt < DEPLOY_TIMEOUT_MS) {
        if (isReady(deployment) && deployment.alias?.length) return deployment
        if (isFailed(deployment)) {
            throw new Error(
                `Vercel deployment ${deploymentId(deployment)} failed${deployment.errorCode ? ` (${deployment.errorCode})` : ""}${deployment.errorMessage ? `: ${deployment.errorMessage}` : ""}`
            )
        }

        const state = getDeploymentState(deployment)
        const seconds = Math.floor((Date.now() - startedAt) / 1000)
        setStep(
            `Waiting for Vercel deployment ${deploymentId(deployment)}: ${state} (${seconds}s)`
        )
        await delay(POLL_INTERVAL_MS)
        deployment = await getDeployment(token, deploymentId(deployment))
    }

    throw new Error(
        `Timed out after ${DEPLOY_TIMEOUT_MS / 60_000} minutes waiting for Vercel deployment ${deploymentId(deployment)}; last state was ${getDeploymentState(deployment)}`
    )
}

function getDeployment(
    token: string,
    deploymentId: string
): Promise<VercelDeployment> {
    return vercelFetch<VercelDeployment>(
        token,
        `/v13/deployments/${encodeURIComponent(deploymentId)}`
    )
}

function getProductionURL(
    project: VercelProject,
    deployment: VercelDeployment
): string {
    const expected = `${project.name}.vercel.app`
    const alias =
        deployment.alias?.find((value) => value == expected) ??
        deployment.alias?.find((value) => value.endsWith(".vercel.app"))
    if (!alias) {
        throw new Error(
            `Vercel deployment ${deploymentId(deployment)} is ready without a public production alias`
        )
    }
    return `https://${alias}`
}

function isReady(deployment: VercelDeployment | undefined): boolean {
    return getDeploymentState(deployment) == "READY"
}

function isFailed(deployment: VercelDeployment): boolean {
    return ["ERROR", "CANCELED"].includes(getDeploymentState(deployment))
}

function getDeploymentState(deployment: VercelDeployment | undefined): string {
    return (
        deployment?.readyState ??
        deployment?.state ??
        deployment?.status ??
        "UNKNOWN"
    ).toUpperCase()
}

function deploymentId(deployment: VercelDeployment): string {
    const id = deployment.id ?? deployment.uid
    if (!id) throw new Error("Vercel deployment response did not include an ID")
    return id
}

async function waitForValidatorEndpoint(endpoint: string): Promise<void> {
    let lastResult = "no response"
    for (let attempt = 0; attempt < 30; attempt++) {
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            })
            if (response.status == 400) return
            lastResult = `HTTP ${response.status} ${response.statusText}`
        } catch (error) {
            lastResult = error instanceof Error ? error.message : String(error)
        }
        await delay(1_000)
    }
    throw new Error(
        `The deployed Vercel validator did not become ready; last result: ${lastResult}`
    )
}

async function runDeploymentStep<T>(
    step: string,
    setStep: (step: string) => void,
    action: () => Promise<T>
): Promise<T> {
    setStep(step)
    try {
        return await action()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`${step} failed: ${message}`)
    }
}

async function vercelFetch<T>(
    token: string,
    path: string,
    init: RequestInit = {}
): Promise<T> {
    const response = await vercelRequest(token, path, init)
    if (!response.ok) {
        let body: unknown
        try {
            body = await response.json()
        } catch {
            body = await response.text()
        }
        throw vercelResponseError(response, body)
    }
    if (response.status == 204) return undefined as T
    const body = await response.text()
    return body ? (JSON.parse(body) as T) : (undefined as T)
}

async function vercelRequest(
    token: string,
    path: string,
    init: RequestInit
): Promise<Response> {
    const url = `${API_URL}${path}`
    try {
        return await fetch(url, {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                ...init.headers
            }
        })
    } catch (error) {
        throw new Error(
            `${init.method ?? "GET"} ${url} could not reach the Vercel API: ${error instanceof Error ? error.message : String(error)}`
        )
    }
}

function vercelResponseError(response: Response, body: unknown): Error {
    const value = body as {
        code?: string
        message?: string
        error?: { code?: string; message?: string }
    }
    const error = value?.error ?? value
    const detail = error?.message ?? JSON.stringify(body).slice(0, 1000)
    const code = error?.code ? ` (${error.code})` : ""
    const requestId = response.headers.get("x-vercel-id")
    return new Error(
        `HTTP ${response.status} ${response.statusText}${code}${requestId ? ` [${requestId}]` : ""}${detail ? `: ${detail}` : ""}`
    )
}

function canonicalEnvironment(values: Record<string, string>): string {
    return JSON.stringify(
        Object.fromEntries(
            Object.entries(values).sort(([left], [right]) =>
                left.localeCompare(right)
            )
        )
    )
}

function concatBytes(values: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(
        values.reduce((total, value) => total + value.byteLength, 0)
    )
    let offset = 0
    for (const value of values) {
        result.set(value, offset)
        offset += value.byteLength
    }
    return result
}

async function sha1(value: Uint8Array): Promise<string> {
    return digest("SHA-1", value)
}

async function sha256(value: Uint8Array): Promise<string> {
    return digest("SHA-256", value)
}

async function digest(algorithm: string, value: Uint8Array): Promise<string> {
    const result = await crypto.subtle.digest(algorithm, value)
    return bytesToHex(Array.from(new Uint8Array(result)))
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
