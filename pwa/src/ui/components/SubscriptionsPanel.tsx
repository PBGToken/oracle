import styled from "styled-components"
import { SubscriptionItem } from "./SubscriptionItem"

export function SubscriptionsPanel() {
    return (
        <StyledSubscriptionsPanel>
            <SubscriptionItem stage="Preprod" />
            <SubscriptionItem stage="Beta" />
            <SubscriptionItem stage="Mainnet" />
        </StyledSubscriptionsPanel>
    )
}

const StyledSubscriptionsPanel = styled.div`
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 10px;
`
