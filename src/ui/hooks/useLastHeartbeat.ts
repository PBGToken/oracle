import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { type StageName } from "src/worker/stages"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "lastHeartbeat"

export function useLastHeartbeat(): Record<StageName, number> {
    const data = useQuery({
        queryKey: [QUERY_KEY],
        refetchInterval: 1000,
        queryFn: async () => {
            const hb: Record<StageName, number> = await fetchWorker(
                "get",
                "lastHeartbeat"
            )

            return hb
        }
    }).data

    return useMemo(() => {
        if (data) {
            return data
        } else {
            return {
                Mainnet: 0,
                Preprod: 0,
                Beta: 0
            }
        }
    }, [data])
}
