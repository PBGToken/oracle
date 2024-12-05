import { useQuery } from "@tanstack/react-query";
import { fetchWorker } from "./fetchWorker";
import { useWorkerTick } from "./useWorkerTick";

export function useIsSubscribed(): boolean {
    const tick = useWorkerTick()

    const query = useQuery({
        queryKey: [`isSubscribed/${tick}`],
        queryFn: async () => {
            const b: boolean = await fetchWorker("get", "isSubscribed")

            return b
        }
    })

    return query.data ?? false
}