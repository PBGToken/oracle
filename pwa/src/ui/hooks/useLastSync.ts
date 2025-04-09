import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "lastSync"

export function useLastSync(): number {
    const data = useQuery({
        queryKey: [QUERY_KEY],
        refetchInterval: 1000,
        queryFn: async () => {
            const hb: number = await fetchWorker("get", "lastSync")

            return hb
        }
    }).data

    return useMemo(() => {
        if (data) {
            return data
        } else {
            return 0
        }
    }, [data])
}
