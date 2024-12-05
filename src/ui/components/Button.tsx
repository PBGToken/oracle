import { type ButtonHTMLAttributes } from "react"
import styled from "styled-components"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    $secondary?: boolean
}

const height = 60
const borderRadius = 5

export function Button(props: ButtonProps) {
    return (
        <StyledButton {...props} $secondary={!!props.$secondary}>
            {props.children}
        </StyledButton>
    )
}

type StyledButtonProps = {
    $secondary: boolean
}

const StyledButton = styled.button<StyledButtonProps>`
    background: ${({ theme, $secondary }) =>
        $secondary ? "transparent" : theme.colors.primary};
    border: none;
    border-radius: ${borderRadius}px;
    color: ${({ theme, $secondary }) =>
        $secondary ? "inherit" : theme.colors.buttonText};
    font-size: 14px;
    font-weight: bold;
    height: ${height}px;
    padding: 10px;

    &:hover {
        background: ${({ theme, $secondary }) =>
            $secondary ? "#f0f0f0" : theme.colors.buttonHover};
        cursor: pointer;
    }

    &:disabled {
        background: ${({ theme, $secondary }) =>
            $secondary ? "#f4f4f4" : theme.colors.primary};
        cursor: unset;
        opacity: 0.5;
    }
`
