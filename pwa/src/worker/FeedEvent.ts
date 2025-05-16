export type FeedEvent = {
    stage?: string // use plain string because at this point it doesn't matter (only used for representation or debugging)
    hash: string
    error?: string
    timestamp: number
    prices: Record<string, number>
    message?: string
}

export function formatPrices(prices: Record<string, number>): string {
    const parts: string[] = []

    for (let key in prices) {
        parts.push(`${key}/ADA=${prices[key].toFixed(6)}`)
    }

    if (parts.length == 0) {
        return `empty groups`
    } else {
        return parts.join(", ")
    }
}
