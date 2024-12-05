import { useQuery } from "@tanstack/react-query";
import { fetchWorker } from "./fetchWorker";
import { useWorkerTick } from "./useWorkerTick";

export function useIsAuthorized(): boolean {
    const tick = useWorkerTick()

    const query = useQuery({
        queryKey: [`isAuthorized/${tick}`],
        queryFn: async () => {
            const b: boolean = await fetchWorker("get", "isAuthorized")

            return b
        }
    })

    return query.data ?? false
}