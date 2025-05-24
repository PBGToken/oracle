import { dirname, join } from "node:path"
import { build } from "esbuild"

async function main() {
    const repoRoot = join(dirname(process.argv[1]), "./")

    await build({
        bundle: true,
        splitting: false,
        treeShaking: true,
        sourcemap: false,
        format: "cjs",
        banner: {},
        platform: "node",
        minify: false,
        outfile: join(repoRoot, "../dist/aws-validator.js"),
        entryPoints: [join(repoRoot, "src", "validators", "aws.ts")],
        define: {},
        tsconfig: join(repoRoot, "tsconfig.json")
    })
}

main()
