import { dirname, join } from "node:path"
import { defineConfig } from "vite"
import makeReactPlugin from "@vitejs/plugin-react"

// process.argv[1] is the vite binary
const repoRoot = join(dirname(process.argv[1]), "../../")
const srcDir = join(repoRoot, "src")
const assetsDir = join(repoRoot, "assets")
const dstDir = join(repoRoot, "dist/")

export default defineConfig({
    root: srcDir,
    build: {
        outDir: dstDir,
        emptyOutDir: true,
        minify: false
    },
    define: {},
    resolve: {},
    server: {
        port: 80
    },
    publicDir: assetsDir,
    plugins: [
        makeReactPlugin({
            babel: {
                plugins: [
                    [
                        "babel-plugin-styled-components",
                        {
                            ssr: false,
                            pure: true,
                            displayName: true,
                            fileName: true
                        }
                    ]
                ]
            }
        })
    ]
})
