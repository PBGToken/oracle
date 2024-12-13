import { keyframes, styled } from "styled-components"

const spin = keyframes`
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
`

export const Spinner = styled.div`
    display: block;
    width: 40px;
    height: 40px;
    position: relative;
    text-align: center;

    &:before {
        content: ' ';
        display: block;
        margin: 0 auto;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid #999;
        border-top-color: #e5e5e5;
        animation: ${spin} 1s ease-in-out infinite;
    }
}
`
