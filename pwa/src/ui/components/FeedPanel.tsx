import styled from "styled-components"
import { useEvents } from "../hooks"
import { FeedItem } from "./FeedItem"

type FeedPanelProps = {
    className?: string
}

export function FeedPanel({ className }: FeedPanelProps) {
    const events = useEvents()

    return (
        <StyledFeedPanel className={className}>
            <h2>Feed</h2>

            {events.map((event) => {
                return (
                    <FeedItem
                        event={event}
                        key={event.hash + event.timestamp.toString()}
                    />
                )
            })}
        </StyledFeedPanel>
    )
}

const StyledFeedPanel = styled.div`
    background: #fff;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    padding: 10px;
`
