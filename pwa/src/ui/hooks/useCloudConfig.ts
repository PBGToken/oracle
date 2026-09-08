import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult
} from "@tanstack/react-query"
import { DEFAULT_CLOUD_CONFIG, type CloudConfig } from "../../cloud"
import { fetchWorker } from "./useServiceWorker"

const QUERY_KEY = "cloudConfig"

export function useCloudConfig(): [
    CloudConfig,
    UseMutationResult<void, Error, CloudConfig, unknown>
] {
    const client = useQueryClient()
    const query = useQuery({
        queryKey: [QUERY_KEY],
        queryFn: () => fetchWorker("get", "cloudConfig") as Promise<CloudConfig>
    })
    const mutation = useMutation({
        mutationKey: [QUERY_KEY],
        mutationFn: async (config: CloudConfig) => {
            await fetchWorker("set", "cloudConfig", config)
        },
        onSuccess: (_data, config) => {
            client.setQueryData([QUERY_KEY], config)
        }
    })

    return [query.data ?? DEFAULT_CLOUD_CONFIG, mutation]
}
