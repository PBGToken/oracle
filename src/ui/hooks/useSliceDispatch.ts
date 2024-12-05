import { useCallback } from "react"
import { useDispatch } from "react-redux"
import {
    AnyAction,
    CaseReducerActions,
    Slice,
    SliceCaseReducers
} from "@reduxjs/toolkit"
import { store } from "./store"

type Callback<S, A extends SliceCaseReducers<S>, R extends AnyAction> = (
    actions: CaseReducerActions<A, string>
) => R

export function useSliceDispatch<
    S,
    A extends SliceCaseReducers<S>,
    R extends AnyAction
>(slice: Slice<S, A>): (callback: Callback<S, A, R>) => void {
    const dispatch = useDispatch()

    return useCallback(
        (callback: Callback<S, A, R>) => {
            if (!(slice.name in store.reducers)) {
                store.injectReducer(slice.name, slice.reducer)
            }

            dispatch(callback(slice.actions))
        },
        [dispatch]
    )
}
