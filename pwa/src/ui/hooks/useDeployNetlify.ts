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
    required_functions?: string[]
}

export function useDeployNetlify(): UseMutationResult<
    void,
    Error,
    DeployNetlifyArgs,
    undefined
> {
    const [cloudConfig, saveCloudConfig] = useCloudConfig()
    const [privateKey] = usePrivateKey()

    return useMutation({
        mutationKey: ["netlify-deploy"],
        mutationFn: async ({ stage }) => {
            if (!cloudConfig.netlifyToken || !privateKey) {
                throw new Error(
                    "Netlify and oracle credentials must be configured"
                )
            }

            const token = cloudConfig.netlifyToken
            const stageConfig = stages[stage]
            const secrets = await fetchPlatformSecrets(
                stageConfig.baseUrl,
                privateKey
            )
            const site = await getOrCreateSite(
                token,
                cloudConfig.netlifySiteIds[stage]
            )

            if (cloudConfig.netlifySiteIds[stage] !== site.id) {
                await saveCloudConfig.mutateAsync({
                    ...cloudConfig,
                    netlifySiteIds: {
                        ...cloudConfig.netlifySiteIds,
                        [stage]: site.id
                    }
                })
            }

            await setEnvironmentVariables(token, site, {
                PRIVATE_KEY: privateKey,
                BLOCKFROST_API_KEY: secrets.blockfrostApiKey,
                DVP_ASSETS_VALIDATOR_ADDRESS: stageConfig.assetsValidatorAddress
            })

            const functionZip = await getValidatorZip(`${FUNCTION_NAME}.js`)
            await deployFunction(token, site.id, functionZip)

            const endpoint = `${site.ssl_url || site.url}/.netlify/functions/${FUNCTION_NAME}`
            await waitForValidatorEndpoint(endpoint)
            await syncFunctionURL(endpoint, stageConfig.baseUrl, privateKey)
        }
    })
}

async function waitForValidatorEndpoint(endpoint: string): Promise<void> {
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
            if (response.status == 401 || response.status == 403) {
                throw new Error(
                    "The deployed Netlify validator is not publicly accessible"
                )
            }
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes("not publicly accessible")
            ) {
                throw error
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error("The deployed Netlify validator did not become ready")
}

async function netlifyFetch<T>(
    token: string,
    path: string,
    init: RequestInit = {}
): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            ...init.headers
        }
    })

    if (!response.ok) {
        const body = (await response.text()).slice(0, 1000)
        throw new Error(
            `Netlify request ${path} failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`
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
            body: JSON.stringify({
                sso_login: false
            })
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

    // New Netlify accounts default API-created projects to team-login access.
    // Validator endpoints must be public so the PBG batcher can call them.
    await netlifyFetch<void>(token, `/sites/${encodeURIComponent(siteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sso_login: false
        })
    })

    for (let attempt = 0; attempt < 30; attempt++) {
        const current = await netlifyFetch<NetlifyDeploy>(
            token,
            `/deploys/${encodeURIComponent(deploy.id)}`
        )
        if (current.state == "ready") return
        if (current.state == "error") {
            throw new Error(
                "Netlify failed to process the validator deployment"
            )
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error("Timed out waiting for the Netlify deployment")
}
