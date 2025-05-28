import styled from "styled-components"
import { StageName } from "../hooks/stages"
import { PushAWSLambdaButton } from "./PushAWSLambdaButton"

type SubscriptionItemProps = {
    stage: StageName
}

export function SubscriptionItem({ stage }: SubscriptionItemProps) {
    return (
        <StyledSubscriptionItem>
            <p>{stage}</p>
            <PushAWSLambdaButton stage={stage} />
        </StyledSubscriptionItem>
    )
}

const StyledSubscriptionItem = styled.div`
    background: white;
    border: 1px solid #808080;
    border-radius: 5px;
`
