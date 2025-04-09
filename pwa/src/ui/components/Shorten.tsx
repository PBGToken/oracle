type ShortenProps = {
    value: string
}

export function Shorten({ value }: ShortenProps) {
    const n = value.length

    if (n > 19) {
        value = value.slice(0, 7) + "..." + value.slice(n - 7, n)
    }

    return <>{value}</>
}
