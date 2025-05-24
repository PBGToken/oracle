// TODO: generalize to other cloud providers (this function is AWS-specific)
// TODO: make type-safe
export async function handler(_event: any, _content: any): Promise<any> {
    console.log("Hello world")

    return {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
        },
        body: "{}"
    }
}
