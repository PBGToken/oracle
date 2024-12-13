import { dirname, join } from "node:path"
import { build } from "esbuild"

async function main() {
    const repoRoot = join(dirname(process.argv[1]), "./")

    await build({
        bundle: true,
        splitting: false,
        treeShaking: true,
        sourcemap: false,
        format: "esm",
        banner: {},
        platform: "browser",
        minify: false,
        outfile: join(repoRoot, "preload-db.js"),
        entryPoints: [join(repoRoot, "src", "worker", "preload-db.ts")],
        define: {},
        tsconfig: join(repoRoot, "tsconfig.json")
    })
}

main()
