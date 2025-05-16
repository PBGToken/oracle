import { ReactNode } from "react"
import {
    makeAddress,
    makeAssetClass,
    makePubKeyHash
} from "@helios-lang/ledger"
import { NetworkName } from "@helios-lang/tx-utils"
import { Link } from "./Link"
import { StageName } from "src/worker/stages"

const DEFAULT_LENGTH = 13

const KEYS = ["tx", "policy", "address", "pkh", "asset", "fingerprint"]

type ExplorerLinkProps = {
    stage: StageName
    length?: number
    network?: NetworkName
    children?: ReactNode
} & (
    | {
          tx: string
      }
    | {
          policy: string
      }
    | {
          address: string
      }
    | {
          pkh: string
      }
    | {
          asset: string
      }
    | {
          fingerprint: string
      }
)

export const ExplorerLink = (props: ExplorerLinkProps) => {
    const key = Object.keys(props).filter((key) => KEYS.includes(key))[0]
    const data = (props as any)[key] as string
    const length = props?.length ?? DEFAULT_LENGTH
    const href = createHref(key, data, props.stage)

    return (
        <span>
            <Link href={href}>
                {props.children ? props.children : shorten(data, length)}
            </Link>
        </span>
    )
}

function createHref(key: string, data: string, stage: StageName): string {
    if (data == "") {
        return ""
    }

    const isMainnet = stage != "Preprod"
    const baseUrl = (() => {
        switch (stage) {
            case "Beta":
            case "Mainnet":
                return "https://cexplorer.io"
            case "Preprod":
                return "https://preprod.cexplorer.io"
            default:
                throw new Error(`unhandled stage name ${stage}`)
        }
    })()

    const href = {
        tx: (data: string): string => `${baseUrl}/tx/${data}`,
        policy: (data: string): string => `${baseUrl}/policy/${data}`,
        address: (data: string): string => `${baseUrl}/address/${data}`,
        pkh: (data: string): string =>
            `${baseUrl}/address/${makeAddress(
                isMainnet,
                makePubKeyHash(data)
            ).toBech32()}`,
        asset: (data: string): string =>
            `${baseUrl}/asset/${makeAssetClass(data).toFingerprint()}`,
        fingerprint: (data: string): string => `${baseUrl}/asset/${data}`
    }[key as "tx" | "policy" | "address" | "asset" | "fingerprint"](data)

    return href
}

function shorten(data: string, n = 13): string {
    if (data.length <= n) {
        return data
    } else {
        return `${data.slice(0, (n - 3) / 2)}...${data.slice(
            data.length - (n - 3) / 2
        )}`
    }
}
