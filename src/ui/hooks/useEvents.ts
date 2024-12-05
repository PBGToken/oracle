import { useQuery } from "@tanstack/react-query"
import { type FeedEvent } from "../../worker/FeedEvent"
import { fetchWorker } from "./fetchWorker"
import { useWorkerTick } from "./useWorkerTick"

const QUERY_KEY = "events"

export function useEvents(): FeedEvent[] {
    const tick = useWorkerTick()

    const query = useQuery({
        queryKey: [`${QUERY_KEY}/${tick}`],
        queryFn: async () => {
            const events:  FeedEvent[] = await fetchWorker("get", "events")

            // newest first
            events.sort((a, b) => b.timestamp - a.timestamp)
            
            return events
        }
    })

    return query.data ?? []
}