import { createGlobalStyle } from "styled-components"

export const GlobalStyle = createGlobalStyle`
    :root {
        font-family: Roboto, sans-serif;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        -webkit-text-size-adjust: 100%;
    }

    * {
        margin: 0;
        padding: 0;   
    }
    
    html {
        background: ${({ theme }) => theme.colors.pageBg};
    }

    body {
    }

    #root {
    }
`
