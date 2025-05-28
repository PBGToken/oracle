export type StageName = "Mainnet" | "Beta" | "Preprod"

type StageConfig = {
    baseUrl: string
    assetsValidatorAddress: string
}

export const STAGE_NAMES: StageName[] = ["Mainnet", "Preprod", "Beta"]

export function isValidStageName(str: string): str is StageName {
    return (STAGE_NAMES as string[]).includes(str)
}

export function assertValidStageName(str: string): asserts str is StageName {
    if (!isValidStageName(str)) {
        throw new Error(`unrecognized stage '${str}'`)
    }
}

export const stages: Record<StageName, StageConfig> = {
    Mainnet: {
        baseUrl: "https://api.oracle.token.pbg.io",
        assetsValidatorAddress:
            "addr1w9vdxw6jqws6tfq40j442qaw2704ya76eal6qlwvks5vckgeh2sx5"
    },
    Beta: {
        baseUrl: "https://api.oracle.beta.pbgtoken.io",
        assetsValidatorAddress:
            "addr1w8x0dausf8jjrg4ep3ds3trne80ravxtpa5hutnc0auvlws5wqake"
    },
    Preprod: {
        baseUrl: "https://api.oracle.preprod.pbgtoken.io",
        assetsValidatorAddress:
            "addr_test1wpwtcp7kedkjxxg3z64s9e79379yudmecclh5yycrxfg26q6rl3wp"
    }
}
