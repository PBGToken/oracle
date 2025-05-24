import {
    useMutation,
    type UseMutationResult,
    useQuery,
    useQueryClient
} from "@tanstack/react-query"
import { fetchWorker } from "./useServiceWorker"
import { useMemo } from "react"

const QUERY_KEY = "awsAccessKey"

export function useAWSAccessKey(): [
    [string, string],
    UseMutationResult<void, Error, [string, string], unknown>
] {
    const client = useQueryClient()

    const query = useQuery({
        queryKey: [QUERY_KEY],
        queryFn: async () => {
            const key: [string, string] = await fetchWorker(
                "get",
                "awsAccessKey"
            )

            return key
        }
    })

    const mutation = useMutation({
        mutationKey: [QUERY_KEY],
        mutationFn: async (keys: [string, string]) => {
            await fetchWorker("set", "awsAccessKey", keys)
        },
        onSuccess: (_data, keys: [string, string]) => {
            client.setQueryData([QUERY_KEY], () => keys)
        }
    })

    const data = useMemo(() => {
        return (query.data ?? ["", ""]) as [string, string]
    }, [query.data])

    return [data, mutation]
}
