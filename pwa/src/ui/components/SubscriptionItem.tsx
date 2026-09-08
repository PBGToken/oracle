import styled from "styled-components"
import { StageName } from "../hooks/stages"
import { DeployValidatorButton } from "./DeployValidatorButton"

type SubscriptionItemProps = {
    stage: StageName
}

export function SubscriptionItem({ stage }: SubscriptionItemProps) {
    return (
        <StyledSubscriptionItem>
            <p>{stage}</p>
            <DeployValidatorButton stage={stage} />
        </StyledSubscriptionItem>
    )
}

const StyledSubscriptionItem = styled.div`
    background: white;
    border: 1px solid #808080;
    border-radius: 5px;
`
