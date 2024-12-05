import styled from "styled-components"
import { useBlocked } from "../hooks"
import { Button } from "./Button"

export function Header() {
    const [blocked, setBlocked] = useBlocked()

    const handleToggleBlocked = () => {
        setBlocked(!blocked)
    }

    return (
        <StyledHeader>
            <h1>PBG Oracle Client</h1>

            <Button $secondary={true} onClick={handleToggleBlocked}>
                {/*blocked ? "Play" : "Pause"*/}
            </Button>
        </StyledHeader>
    )
}

const StyledHeader = styled.div`
    display: flex;
    flex-direction: row;
    height: 60px;
    justify-content: space-between;
`
