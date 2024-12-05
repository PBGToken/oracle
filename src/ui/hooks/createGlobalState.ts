import { useCallback } from "react"
import { createSlice, type Draft, type PayloadAction } from "@reduxjs/toolkit"
import { useSliceDispatch } from "./useSliceDispatch"
import { useSliceSelector } from "./useSliceSelector"

// TODO: instead of persist prefix, 3rd optional boolean argument to indicate if it can be persistent
export function createGlobalState<T>(
    name: string,
    initialValue: T
): () => [T, (newValue: T) => void] {
    const slice = createSlice({
        name: name,
        initialState: {
            payload: initialValue
        },
        reducers: {
            setPayload: (state, action: PayloadAction<T>) => {
                state.payload = action.payload as Draft<T>
            }
        }
    })

    return (): [T, (newValue: T) => void] => {
        const oldValue = useSliceSelector(slice, (state) => state.payload)
        const dispatch = useSliceDispatch(slice)

        const setValue = useCallback(
            (newValue: T) =>
                dispatch((actions) => actions.setPayload(newValue)),
            [dispatch]
        )

        return [oldValue, setValue]
    }
}
