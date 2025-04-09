import styled from "styled-components"

export function Header() {
    return (
        <StyledHeader>
            <h1>PBG Oracle Client</h1>
        </StyledHeader>
    )
}

const StyledHeader = styled.div`
    display: flex;
    flex-direction: row;
    height: 60px;
    justify-content: space-between;
`
