import {
    useMutation,
    UseMutationResult,
    useQuery,
    useQueryClient
} from "@tanstack/react-query"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "deviceId"

export function useDeviceId(): [
    number,
    UseMutationResult<void, Error, number>
] {
    const client = useQueryClient()

    const query = useQuery({
        queryKey: [QUERY_KEY],
        queryFn: async () => {
            const id: number = await fetchWorker("get", "deviceId")

            return id
        }
    })

    const mutation = useMutation({
        mutationKey: [QUERY_KEY],
        mutationFn: async (id: number) => {
            await fetchWorker("set", "deviceId", id)
        },
        onSuccess: (_data, id: number) => {
            client.setQueryData([QUERY_KEY], () => id)
        }
    })

    return [query.data ?? 0, mutation]
}
