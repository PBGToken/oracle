export function parseRequestBody<T>(body: unknown): T {
    return JSON.parse(requestBodyText(body)) as T
}

function requestBodyText(body: unknown): string {
    if (typeof body == "string") return body

    if (ArrayBuffer.isView(body)) {
        return new TextDecoder().decode(
            new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
        )
    }

    if (body instanceof ArrayBuffer) {
        return new TextDecoder().decode(new Uint8Array(body))
    }

    if (
        Array.isArray(body) &&
        body.every(
            (value) => Number.isInteger(value) && value >= 0 && value <= 255
        )
    ) {
        return new TextDecoder().decode(new Uint8Array(body))
    }

    throw new TypeError("request body must be a string or byte array")
}
