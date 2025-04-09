import { useQuery } from "@tanstack/react-query"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "isSubscribed"

export function useIsSubscribed(): boolean {
    const query = useQuery({
        queryKey: [QUERY_KEY],
        refetchInterval: 1000,
        queryFn: async () => {
            const b: boolean = await fetchWorker("get", "isSubscribed")

            return b
        }
    })

    return query.data ?? false
}
