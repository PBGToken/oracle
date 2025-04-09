import { useQuery } from "@tanstack/react-query"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "isAuthorized"

export function useIsAuthorized(): string[] {
    const query = useQuery({
        queryKey: [QUERY_KEY],
        refetchInterval: 1000,
        queryFn: async () => {
            const b: string[] = await fetchWorker("get", "isAuthorized")

            return b
        }
    })

    return query.data ?? []
}
