import { createGlobalState } from "./createGlobalState";

export const useWorkerTickInternal = createGlobalState("workerTick", 0)

export function useWorkerTick() {
    return useWorkerTickInternal()[0]
}