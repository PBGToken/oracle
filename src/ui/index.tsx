import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Provider } from "react-redux"
import { ThemeProvider } from "styled-components"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { GlobalStyle, MainPage } from "./components"
import { store } from "./hooks"
import { theme } from "./theme"

const root = document.getElementById("root") as HTMLElement
const queryClient = new QueryClient()

createRoot(root).render(
    <StrictMode>
        <Provider store={store}>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider theme={theme}>
                    <GlobalStyle />

                    <MainPage />
                </ThemeProvider>
            </QueryClientProvider>
        </Provider>
    </StrictMode>
)
