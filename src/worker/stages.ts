export type StageName = "mainnet" | "beta" | "preprod"

type StageConfig = {
    baseUrl: string
}

export const STAGE_NAMES: StageName[] = ["mainnet", "preprod", "beta"]

export const stages: Record<StageName, StageConfig> = {
    mainnet: {
        baseUrl: "https://api.oracle.token.pbg.io"
    },
    beta: {
        baseUrl: "https://api.oracle.beta.pbgtoken.io"
    },
    preprod: {
        baseUrl: "https://api.oracle.preprod.pbgtoken.io"
    }
}
