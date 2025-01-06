import {
    useMutation,
    UseMutationResult,
    useQuery,
    useQueryClient
} from "@tanstack/react-query"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "isPrimary"

export function useIsPrimary(): [
    boolean | undefined,
    UseMutationResult<void, Error, boolean, unknown>
] {
    const client = useQueryClient()

    const query = useQuery({
        queryKey: [QUERY_KEY],
        queryFn: async () => {
            const key: boolean = await fetchWorker("get", "isPrimary")

            return key
        }
    })

    const mutation = useMutation({
        mutationKey: [QUERY_KEY],
        mutationFn: async (b: boolean) => {
            await fetchWorker("set", "isPrimary", b)
        },
        onSuccess: (_data, b: boolean) => {
            client.setQueryData([QUERY_KEY], () => b)
        }
    })

    return [query.data ?? undefined, mutation]
}
