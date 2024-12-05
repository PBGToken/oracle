import { createGlobalState } from "./createGlobalState"

export const useBlocked = createGlobalState("blocked", false)
