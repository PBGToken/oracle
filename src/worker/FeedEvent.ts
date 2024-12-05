export type FeedEvent = {
    hash: string
    timestamp: number
    prices: Record<string, number>
}