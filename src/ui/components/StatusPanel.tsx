import styled from "styled-components"
import {
    useDeviceId,
    useIsAuthorized,
    useIsSubscribed,
    useNotificationPermission,
    usePrivateKey
} from "../hooks"
import { makeBip32PrivateKey } from "@helios-lang/tx-utils"
import { hexToBytes } from "@helios-lang/codec-utils"
import { Button } from "./Button"
import { ErrorMessage } from "./ErrorMessage"
import { IsPrimary } from "./IsPrimary"
import { Shorten } from "./Shorten"

const borderRadius = 5

type StatusProps = {
    serviceWorkerStatus: string
    onChangeKey: () => void
}

export function StatusPanel({ onChangeKey, serviceWorkerStatus }: StatusProps) {
    const [privateKey] = usePrivateKey()
    const [deviceId] = useDeviceId()

    const isSubscribed = useIsSubscribed()
    const [granted, grant, error] = useNotificationPermission()

    const pubKeyHash =
        privateKey != ""
            ? makeBip32PrivateKey(hexToBytes(privateKey))
                  .derivePubKey()
                  .hash()
                  .toHex()
            : ""

    return (
        <StyledStatusPanel>
            <h2>Status</h2>
            <p>Version: {process.env.VERSION}</p>
            <p>Service worker: {serviceWorkerStatus}</p>
            <p>
                {granted
                    ? "Notification permission granted"
                    : "Notification permission not granted"}
            </p>
            {!granted && <Button onClick={grant}>Enable Notifications</Button>}
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <IsPrimary />
            <p>
                Key:{" "}
                {pubKeyHash == "" ? "unset" : <Shorten value={pubKeyHash} />}
            </p>
            <p>Device ID: {deviceId ? deviceId.toString() : "unset"}</p>
            <IsAuthorized />
            <p>{isSubscribed ? "Subscribed" : "Not subscribed"}</p>
            <Button onClick={onChangeKey}>
                {privateKey == "" ? "Set Key" : "Change Key"}
            </Button>
        </StyledStatusPanel>
    )
}

function IsAuthorized() {
    const isAuthorized = useIsAuthorized()

    return (
        <p>
            Authorized:{" "}
            {isAuthorized.length == 0 ? "none" : isAuthorized.join(", ")}
        </p>
    )
}

const StyledStatusPanel = styled.div`
    background: ${({ theme }) => theme.colors.panelBg};
    border-radius: ${borderRadius}px;
    padding: 10px;
`
