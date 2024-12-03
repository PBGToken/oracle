import { dirname, join } from "node:path"
import { defineConfig } from "vite"
import makeReactPlugin from "@vitejs/plugin-react"

// process.argv[1] is the vite binary
const repoRoot = join(dirname(process.argv[1]), "../../")
const srcDir = join(repoRoot, "./src")
const assetsDir = join(repoRoot, "./src/assets")
const dstDir = join(repoRoot, "./")

export default defineConfig({
    root: srcDir,
    base: "./",
    build: {
        outDir: dstDir,
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
            output: {
              entryFileNames: "index.js",
            }
        }
        ,
        terserOptions: {
            compress: false,
            mangle: false,
          }
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
