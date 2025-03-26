import { type ChangeEvent } from "react"
import styled from "styled-components"
import { useIsPrimary, useLastHeartbeat, useLastSync } from "../hooks"

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
    const ls = useLastSync()

    return (
        <div>
            <StyledLastHeartbeat>
                Last subscription sync :{" "}
                {ls == 0 ? "never" : new Date(ls).toLocaleString()}
            </StyledLastHeartbeat>
            <StyledLastHeartbeat>
                Last Mainnet heartbeat:{" "}
                {hb.Mainnet == 0
                    ? "never"
                    : new Date(hb.Mainnet).toLocaleString()}
            </StyledLastHeartbeat>
            <StyledLastHeartbeat>
                Last Beta heartbeat:{" "}
                {hb.Beta == 0 ? "never" : new Date(hb.Beta).toLocaleString()}
            </StyledLastHeartbeat>
            <StyledLastHeartbeat>
                Last Preprod heartbeat:{" "}
                {hb.Preprod == 0
                    ? "never"
                    : new Date(hb.Preprod).toLocaleString()}
            </StyledLastHeartbeat>
        </div>
    )
}

const StyledLastHeartbeat = styled.p`
    margin-left: 30px;
`
