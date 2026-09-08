import { useCallback, useState } from "react"
import { styled } from "styled-components"
import { useServiceWorker } from "../hooks"
import { useCloudConfig } from "../hooks/useCloudConfig"
import { Button } from "./Button"
import { CloudProviderForm } from "./CloudProviderForm"
import { ChangeKeyButton } from "./ChangeKeyButton"
import { Header } from "./Header"
import { KeyInput } from "./KeyInput"
import { StatusPanel } from "./StatusPanel"
import { SubscriptionsPanel } from "./SubscriptionsPanel"

export function MainPage() {
    const [showDialog, setShowDialog] = useState<"" | "key" | "cloud">("")
    const [cloudConfig] = useCloudConfig()

    const serviceWorkerStatus = useServiceWorker()

    const handleShowChangeKey = useCallback(() => {
        setShowDialog("key")
    }, [setShowDialog])

    const handleShowCloudProvider = useCallback(() => {
        setShowDialog("cloud")
    }, [setShowDialog])

    const handleHideDialog = useCallback(() => {
        setShowDialog("")
    }, [setShowDialog])

    return (
        <StyledMainPage>
            <Header />

            {showDialog == "key" ? (
                <KeyInput onClose={handleHideDialog} />
            ) : showDialog == "cloud" ? (
                <CloudProviderForm onClose={handleHideDialog} />
            ) : (
                <>
                    <StatusPanel serviceWorkerStatus={serviceWorkerStatus}>
                        <Column>
                            <ChangeKeyButton onChange={handleShowChangeKey} />
                            <Button onClick={handleShowCloudProvider}>
                                Cloud provider:{" "}
                                {cloudConfig.provider == "netlify"
                                    ? "Netlify"
                                    : "AWS"}
                            </Button>
                        </Column>
                    </StatusPanel>

                    <SubscriptionsPanel />

                    {/*<a
                        href="./pbg_oracle.apk"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Install Android native
                    </a>*/}

                    {/*<FeedPanel />*/}
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

const Column = styled.div`
    display: flex;
    gap: 12px;
    flex-direction: column;
`
