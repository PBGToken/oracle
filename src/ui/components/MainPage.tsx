import { useState } from "react"
import styled from "styled-components"
import { useServiceWorker } from "../hooks"
import { FeedPanel } from "./FeedPanel"
import { Header } from "./Header"
import { KeyInput } from "./KeyInput"
import { StatusPanel } from "./StatusPanel"

export function MainPage() {
    const [showKeyInput, setShowKeyInput] = useState(false)
    const serviceWorkerStatus = useServiceWorker()

    return (
        <StyledMainPage>
            <Header />

            {showKeyInput ? (
                <KeyInput onClose={() => setShowKeyInput(false)} />
            ) : (
                <>
                    <StatusPanel serviceWorkerStatus={serviceWorkerStatus} onChangeKey={() => setShowKeyInput(true)} />

                    <FeedPanel />
                </>
            )}
        </StyledMainPage>
    )
}

const StyledMainPage = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin: auto;
    max-width: 500px;
`
