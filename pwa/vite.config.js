import { dirname, join } from "node:path"
import { execSync } from "node:child_process"
import { defineConfig } from "vite"
import makeReactPlugin from "@vitejs/plugin-react"
import { viteStaticCopy } from "vite-plugin-static-copy"

// process.argv[1] is the vite binary
const repoRoot = join(dirname(process.argv[1]), "../../")
const srcDir = join(repoRoot, "./src/ui")
const assetsDir = join(repoRoot, "./assets")
const dstDir = join(repoRoot, "../dist")

const version = execSync("git rev-parse --short HEAD").toString().slice(0, 6)

export default defineConfig({
    root: srcDir,
    base: "./",
    build: {
        outDir: dstDir,
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
            output: {
                entryFileNames: "index.js"
            }
        },
        terserOptions: {
            compress: false,
            mangle: false
        }
    },
    define: {
        "process.env.VERSION": JSON.stringify(version)
    },
    resolve: {},
    server: {
        port: 80
    },
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
        }),
        viteStaticCopy({
            targets: [
                {
                    src: join(assetsDir, "*"),
                    dest: dstDir
                }
            ]
        })
    ]
})
