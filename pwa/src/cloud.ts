import type { StageName } from "./ui/hooks/stages"

export type CloudProvider = "aws" | "netlify" | "vercel"

export type CloudConfig = {
    provider: CloudProvider
    netlifyToken: string
    netlifySiteIds: Partial<Record<StageName, string>>
    vercelToken: string
    vercelProjectIds: Partial<Record<StageName, string>>
}

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
    provider: "aws",
    netlifyToken: "",
    netlifySiteIds: {},
    vercelToken: "",
    vercelProjectIds: {}
}

export function normalizeCloudConfig(value: unknown): CloudConfig {
    const config =
        value && typeof value == "object"
            ? (value as Partial<CloudConfig>)
            : DEFAULT_CLOUD_CONFIG
    const provider =
        config.provider == "netlify" || config.provider == "vercel"
            ? config.provider
            : "aws"

    return {
        ...DEFAULT_CLOUD_CONFIG,
        ...config,
        provider,
        netlifySiteIds: config.netlifySiteIds ?? {},
        vercelProjectIds: config.vercelProjectIds ?? {}
    }
}
