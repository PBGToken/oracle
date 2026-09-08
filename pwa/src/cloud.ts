import type { StageName } from "./ui/hooks/stages"

export type CloudProvider = "aws" | "netlify"

export type CloudConfig = {
    provider: CloudProvider
    netlifyToken: string
    netlifySiteIds: Partial<Record<StageName, string>>
}

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
    provider: "aws",
    netlifyToken: "",
    netlifySiteIds: {}
}
