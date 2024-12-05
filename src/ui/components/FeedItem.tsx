import styled from "styled-components"
import { FeedEvent } from "../../worker/FeedEvent"

type FeedItemProps = {
    event: FeedEvent
}

export function FeedItem({event}: FeedItemProps) {
    return (
        <StyledFeedItem>
            <p>{event.hash}</p>
            <p>{new Date(event.timestamp).toLocaleString()}</p>
        </StyledFeedItem>
    )
}

const StyledFeedItem = styled.div`
    background: #ffe;
    display: flex;
    flex-direction: column;
    padding: 10px;
`