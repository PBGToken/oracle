import styled from "styled-components"
import { FeedEvent, formatPrices } from "../../worker/FeedEvent"
import { StageName } from "../../worker/stages"
import { ExplorerLink } from "./ExplorerLink"

type FeedItemProps = {
    className?: string
    event: FeedEvent
}

export function FeedItem({ className, event }: FeedItemProps) {
    const stage = (event.stage ?? "Mainnet") as StageName
    const message =
        Object.keys(event.prices).length == 0
            ? (event.message ?? "")
            : formatPrices(event.prices ?? {})

    return (
        <StyledFeedItem className={className}>
            <p>
                {stage}
                {event.error ? `, not signed (${event.error})` : ""}
            </p>
            <p>
                Tx ID: <ExplorerLink tx={event.hash} stage={stage} />
            </p>
            <p>{new Date(event.timestamp).toLocaleString()}</p>
            <p>{message}</p>
        </StyledFeedItem>
    )
}

const StyledFeedItem = styled.div`
    background: #ffe;
    display: flex;
    flex-direction: column;
    padding: 10px;
`
