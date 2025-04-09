import styled from "styled-components"
import { FeedEvent, formatPrices } from "../../worker/FeedEvent"
import { Shorten } from "./Shorten"

type FeedItemProps = {
    event: FeedEvent
}

export function FeedItem({ event }: FeedItemProps) {
    return (
        <StyledFeedItem>
            <p>
                {event.stage ?? "Mainnet"}
                {event.error ? `, not signed (${event.error})` : ""}
            </p>
            <p>
                Tx ID: <Shorten value={event.hash} />
            </p>
            <p>{new Date(event.timestamp).toLocaleString()}</p>
            <p>{formatPrices(event.prices ?? {})}</p>
        </StyledFeedItem>
    )
}

const StyledFeedItem = styled.div`
    background: #ffe;
    display: flex;
    flex-direction: column;
    padding: 10px;
`
