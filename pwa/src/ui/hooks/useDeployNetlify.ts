import { useState } from "react"
import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import { bytesToHex } from "@helios-lang/codec-utils"
import { useCloudConfig } from "./useCloudConfig"
import { usePrivateKey } from "./usePrivateKey"
import {
    fetchPlatformSecrets,
    getValidatorZip,
    syncFunctionURL
} from "./usePushAWSLambda"
import { type StageName, stages } from "./stages"

const API_URL = "https://api.netlify.com/api/v1"
const FUNCTION_NAME = "validator"

type DeployNetlifyArgs = {
    stage: StageName
}

type NetlifyAccount = {
    id: string
    slug: string
}

type NetlifySite = {
    id: string
    account_id: string
    ssl_url: string
    url: string
}

type NetlifyDeploy = {
    id: string
    state?: string
    error_message?: string | null
    required_functions?: string[]
}

export type DeployNetlifyResult = UseMutationResult<
    void,
    Error,
    DeployNetlifyArgs,
    undefined
> & {
    deploymentStep: string
}

export function useDeployNetlify(): DeployNetlifyResult {
    const [cloudConfig, saveCloudConfig] = useCloudConfig()
    const [privateKey] = usePrivateKey()
    const [deploymentStep, setDeploymentStep] = useState("")

    const mutation = useMutation<void, Error, DeployNetlifyArgs, undefined>({
        mutationKey: ["netlify-deploy"],
        mutationFn: async ({ stage }) => {
            setDeploymentStep("Checking deployment configuration")
            if (!cloudConfig.netlifyToken || !privateKey) {
                throw new Error(
                    "Netlify and oracle credentials must be configured"
                )
            }

            const token = cloudConfig.netlifyToken
            const stageConfig = stages[stage]
            const secrets = await runDeploymentStep(
                "Fetching validator secrets from PBG",
                setDeploymentStep,
                () => fetchPlatformSecrets(stageConfig.baseUrl, privateKey)
            )
            const site = await runDeploymentStep(
                "Finding or creating the Netlify project",
                setDeploymentStep,
                () => getOrCreateSite(token, cloudConfig.netlifySiteIds[stage])
            )

            if (cloudConfig.netlifySiteIds[stage] !== site.id) {
                await runDeploymentStep(
                    "Saving the Netlify project ID",
                    setDeploymentStep,
                    () =>
                        saveCloudConfig.mutateAsync({
                            ...cloudConfig,
                            netlifySiteIds: {
                                ...cloudConfig.netlifySiteIds,
                                [stage]: site.id
                            }
                        })
                )
            }

            await runDeploymentStep(
                `Configuring Netlify project ${site.id}`,
                setDeploymentStep,
                () =>
                    setEnvironmentVariables(token, site, {
                        PRIVATE_KEY: privateKey,
                        BLOCKFROST_API_KEY: secrets.blockfrostApiKey,
                        DVP_ASSETS_VALIDATOR_ADDRESS:
                            stageConfig.assetsValidatorAddress
                    })
            )

            const functionZip = await runDeploymentStep(
                "Preparing the validator function bundle",
                setDeploymentStep,
                () => getValidatorZip(`${FUNCTION_NAME}.js`)
            )
            await runDeploymentStep(
                `Publishing the validator to Netlify project ${site.id}`,
                setDeploymentStep,
                () => deployFunction(token, site.id, functionZip)
            )
            await runDeploymentStep(
                "Making the production validator endpoint public",
                setDeploymentStep,
                () => makeProductionPublic(token, site.id)
            )

            const endpoint = `${site.ssl_url || site.url}/.netlify/functions/${FUNCTION_NAME}`
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

async function runDeploymentStep<T>(
    step: string,
    setStep: (step: string) => void,
    action: () => Promise<T>
): Promise<T> {
    setStep(step)
    try {
        return await action()
    } catch (error) {
        const message =
            error instanceof Error ? error.message : JSON.stringify(error)
        const networkHint = isBrowserNetworkError(message)
            ? " The browser could not complete this cross-origin request. Check the network connection, content blockers, and the browser console."
            : ""
        throw new Error(`${step} failed: ${message}.${networkHint}`)
    }
}

function isBrowserNetworkError(message: string): boolean {
    return /load failed|failed to fetch|networkerror|network request failed/i.test(
        message
    )
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

            // The validator rejects this deliberately incomplete request. A 400
            // proves that it loaded before we register its URL.
            if (response.status == 400) return
            lastResult = `HTTP ${response.status} ${response.statusText}`
            if (response.status == 401 || response.status == 403) {
                throw new Error(
                    `The validator is deployed but Netlify project visibility is still private (${lastResult})`
                )
            }
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes("project visibility is still private")
            ) {
                throw error
            }
            lastResult =
                error instanceof Error ? error.message : JSON.stringify(error)
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error(
        `The deployed Netlify validator did not become ready; last result: ${lastResult}`
    )
}

async function netlifyFetch<T>(
    token: string,
    path: string,
    init: RequestInit = {}
): Promise<T> {
    const url = `${API_URL}${path}`
    const method = init.method ?? "GET"
    let response: Response

    try {
        response = await fetch(url, {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                ...init.headers
            }
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
            `${method} ${url} could not reach the Netlify API: ${message}`
        )
    }

    if (!response.ok) {
        const body = (await response.text()).slice(0, 1000)
        const requestId = response.headers.get("x-request-id")
        throw new Error(
            `${method} ${url} returned HTTP ${response.status} ${response.statusText}${requestId ? ` (request ${requestId})` : ""}${body ? `: ${body}` : ""}`
        )
    }

    return response.status == 204
        ? (undefined as T)
        : ((await response.json()) as T)
}

async function getOrCreateSite(
    token: string,
    savedSiteId: string | undefined
): Promise<NetlifySite> {
    if (savedSiteId) {
        try {
            return await netlifyFetch<NetlifySite>(
                token,
                `/sites/${savedSiteId}`
            )
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("(404 ")) {
                throw error
            }
        }
    }

    const accounts = await netlifyFetch<NetlifyAccount[]>(token, "/accounts")
    const account = accounts[0]
    if (!account) {
        throw new Error("The Netlify token does not have access to an account")
    }

    return netlifyFetch<NetlifySite>(
        token,
        `/${encodeURIComponent(account.slug)}/sites`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}"
        }
    )
}

async function setEnvironmentVariables(
    token: string,
    site: NetlifySite,
    values: Record<string, string>
): Promise<void> {
    const path = `/accounts/${encodeURIComponent(site.account_id)}/env?site_id=${encodeURIComponent(site.id)}`
    const existing = await netlifyFetch<{ key: string }[]>(token, path)
    const existingKeys = new Set(existing.map(({ key }) => key))
    const variables: {
        key: string
        values: { context: string; value: string }[]
        is_secret: boolean
    }[] = Object.entries(values).map(([key, value]) => ({
        key,
        values: [{ context: "all", value }],
        is_secret: false
    }))
    const missing = variables.filter(({ key }) => !existingKeys.has(key))

    await Promise.all(
        variables
            .filter(({ key }) => existingKeys.has(key))
            .map((variable) =>
                netlifyFetch<void>(
                    token,
                    `/accounts/${encodeURIComponent(site.account_id)}/env/${encodeURIComponent(variable.key)}?site_id=${encodeURIComponent(site.id)}`,
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(variable)
                    }
                )
            )
    )

    if (missing.length > 0) {
        await netlifyFetch<void>(token, path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(missing)
        })
    }
}

async function deployFunction(
    token: string,
    siteId: string,
    functionZip: Uint8Array
): Promise<void> {
    const digest = await crypto.subtle.digest("SHA-256", functionZip)
    const sha = bytesToHex(Array.from(new Uint8Array(digest)))
    const deploy = await netlifyFetch<NetlifyDeploy>(
        token,
        `/sites/${encodeURIComponent(siteId)}/deploys`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ functions: { [FUNCTION_NAME]: sha } })
        }
    )

    if (deploy.required_functions?.includes(sha)) {
        await netlifyFetch<void>(
            token,
            `/deploys/${encodeURIComponent(deploy.id)}/functions/${FUNCTION_NAME}?runtime=js&timeout=30&size=${functionZip.byteLength}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/octet-stream" },
                body: functionZip
            }
        )
    }

    for (let attempt = 0; attempt < 30; attempt++) {
        const current = await netlifyFetch<NetlifyDeploy>(
            token,
            `/deploys/${encodeURIComponent(deploy.id)}`
        )
        if (current.state == "ready") return
        if (current.state == "error") {
            throw new Error(
                `Netlify failed to process deploy ${deploy.id}${current.error_message ? `: ${current.error_message}` : ""}`
            )
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error(`Timed out waiting for Netlify deploy ${deploy.id}`)
}

async function makeProductionPublic(
    token: string,
    siteId: string
): Promise<void> {
    // On Netlify's credit-based plans, new projects can inherit private-by-default
    // visibility. Netlify only permits “Make public” after the first successful
    // production deploy. Protecting non-production deploys makes production public.
    await netlifyFetch<NetlifySite>(
        token,
        `/sites/${encodeURIComponent(siteId)}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sso_login: true,
                sso_login_context: "non_production"
            })
        }
    )
}
