import styled from "styled-components"
import { SubscriptionItem } from "./SubscriptionItem"

export function SubscriptionsPanel() {
    return (
        <StyledSubscriptionsPanel>
            {/*<SubscriptionItem stage="Mainnet" />*/}
            {<SubscriptionItem stage="Beta" />}
            <SubscriptionItem stage="Preprod" />
        </StyledSubscriptionsPanel>
    )
}

const StyledSubscriptionsPanel = styled.div`
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 10px;
`
