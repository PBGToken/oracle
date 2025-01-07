import { useQuery } from "@tanstack/react-query"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "lastHeartbeat"

export function useLastHeartbeat(): number {
    const query = useQuery({
        queryKey: [QUERY_KEY],
        refetchInterval: 1000,
        queryFn: async () => {
            const hb: number = await fetchWorker("get", "lastHeartbeat")

            return hb
        }
    })

    return query.data ?? 0
}
