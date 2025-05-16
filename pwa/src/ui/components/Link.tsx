import { ReactNode } from "react"
import { styled } from "styled-components"

type LinkProps = {
    children: ReactNode
    className?: string
} & (
    | {
          href: string
          target?: string
      }
    | {
          onClick: () => void
      }
)

export function Link({ children, className, ...props }: LinkProps) {
    if ("href" in props) {
        return (
            <StyledLink
                className={className}
                href={props.href}
                target={props.target ?? "_blank"}
            >
                {children}
            </StyledLink>
        )
    } else {
        return (
            <StyledLink className={className} onClick={props.onClick}>
                {children}
            </StyledLink>
        )
    }
}

const StyledLink = styled.a`
    color: currentColor;
    cursor: pointer;
    text-decoration: underline;
`
