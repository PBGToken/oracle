import { useSelector } from "react-redux"
import { Slice, SliceCaseReducers } from "@reduxjs/toolkit"
import { store } from "./store"

export function useSliceSelector<S, A extends SliceCaseReducers<S>, R>(
    slice: Slice<S, A>,
    callback: (state: S) => R
) {
    return useSelector((state: any) => {
        if (slice.name in state) {
            return callback(state[slice.name] as S)
        } else {
            store.injectReducer(slice.name, slice.reducer)

            return callback(slice.getInitialState())
        }
    })
}
