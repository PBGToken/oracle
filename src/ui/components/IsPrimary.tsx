import { type ChangeEvent } from "react"
import styled from "styled-components"
import { useIsPrimary, useLastHeartbeat } from "../hooks"

export function IsPrimary() {
    // useState hook for managing the checkbox state
    const [isPrimary, mutation] = useIsPrimary()

    // Event handler for checkbox changes
    const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
        mutation.mutate(event.target.checked)
    }

    return (
        <StyledIsPrimary>
            <label htmlFor="is-primary">Is primary?</label>

            <input
                name="is-primary"
                type="checkbox"
                disabled={isPrimary == undefined}
                checked={!!isPrimary}
                onChange={handleCheckboxChange}
            />

            {!!isPrimary && <LastHeartbeat />}
        </StyledIsPrimary>
    )
}

const StyledIsPrimary = styled.div`
    display: flex;
    flex-direction: row;
`

function LastHeartbeat() {
    const hb = useLastHeartbeat()
    return (
        <StyledLastHeartbeat>
            Last heartbeat: {hb == 0 ? "never" : hb.toString()}
        </StyledLastHeartbeat>
    )
}

const StyledLastHeartbeat = styled.p`
    margin-left: 30px;
`
