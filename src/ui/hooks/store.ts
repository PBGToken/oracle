import {
    persistCombineReducers,
    persistStore,
    FLUSH,
    REHYDRATE,
    PAUSE,
    PERSIST,
    PURGE,
    REGISTER
} from "redux-persist"
import storage from "redux-persist/lib/storage"
import { type Reducer, configureStore, createSlice } from "@reduxjs/toolkit"

function persist() {
    persistor.persist()
}

const persistedState = ["blocked", "deviceId", "privateKey", "secrets"]

const dummyReducer = createSlice({
    name: "dummy",
    initialState: {},
    reducers: {}
}).reducer

export const store = Object.assign(
    configureStore({
        reducer: dummyReducer,
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware({
                serializableCheck: {
                    ignoredActions: [
                        FLUSH,
                        REHYDRATE,
                        PAUSE,
                        PERSIST,
                        PURGE,
                        REGISTER
                    ]
                }
            })
    }),
    {
        reducers: {} as Record<string, Reducer>,
        injectReducer: (name: string, reducer: Reducer) => {
            store.reducers[name] = reducer
            store.replaceReducer(
                persistCombineReducers(
                    {
                        key: "root",
                        storage,
                        whitelist: persistedState
                    },
                    store.reducers
                ) as any
            )
            persist()
        }
    }
)

const persistor = persistStore(store)
