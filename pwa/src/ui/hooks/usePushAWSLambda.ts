import {
    AttachRolePolicyCommand,
    CreateRoleCommand,
    GetRoleCommand,
    IAMClient
} from "@aws-sdk/client-iam"
import {
    AddPermissionCommand,
    CreateFunctionCommand,
    CreateFunctionUrlConfigCommand,
    LambdaClient,
    UpdateFunctionCodeCommand,
    UpdateFunctionConfigurationCommand,
    UpdateFunctionUrlConfigCommand
} from "@aws-sdk/client-lambda"
import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import JSZip from "jszip"
import { useAWSAccessKey } from "./useAWSAccessKey"
import { usePrivateKey } from "./usePrivateKey"
import { deriveECDSAPublicKey, deriveSchnorrPublicKey } from "./keys"
import { createAuthToken, Secrets } from "./secrets"
import { StageName, stages } from "./stages"

const AWS_REGION = "us-east-1"
const NODEJS_RUNTIME = "nodejs22.x"

type PushAWSLambdaArgs = {
    stage: StageName
}

export function usePushAWSLambda(): UseMutationResult<
    void,
    Error,
    PushAWSLambdaArgs,
    undefined
> {
    const [[awsAccessKey, awsSecretAccessKey]] = useAWSAccessKey()
    const [privateKey] = usePrivateKey()

    return useMutation({
        mutationKey: ["aws-lambda"],
        mutationFn: async ({ stage }: PushAWSLambdaArgs) => {
            if (
                awsAccessKey == "" ||
                awsSecretAccessKey == "" ||
                privateKey == ""
            ) {
                return
            }

            const platformURL = stages[stage].baseUrl
            const dvpAssetsValidatorAddr = stages[stage].assetsValidatorAddress

            const functionName = `${stage}PBGOracleValidator`
            const roleName = `${functionName}Role`

            const zipBuffer = await getZipFromUrl()

            const roleArn = await getOrCreateBasicLambdaRole(
                roleName,
                awsAccessKey,
                awsSecretAccessKey
            )

            // TODO: fetch secrets from platform
            const secrets = await fetchPlatformSecrets(platformURL, privateKey)

            const functionURL = await createLambdaFromJSFile(
                zipBuffer,
                functionName,
                awsAccessKey,
                awsSecretAccessKey,
                privateKey,
                secrets,
                roleArn,
                dvpAssetsValidatorAddr
            )

            // now send the URL to the platform
            await syncFunctionURL(functionURL, platformURL, privateKey)
        }
    })
}

function trimSuffix(str: string, suff: string): string {
    while (str.endsWith(suff)) {
        str = str.slice(0, str.length - suff.length)
    }

    return str
}

function getBaseURL(): string {
    let base = window.location.href

    base = trimSuffix(base, "/")
    base = trimSuffix(base, "index.html")
    base = trimSuffix(base, "/")

    return base
}

async function getZipFromUrl(): Promise<Uint8Array> {
    const url = `${getBaseURL()}/aws-validator.js`
    const response = await fetch(url)

    if (!response.ok || response.status >= 400) {
        throw new Error(`failed to fetch "${url}"`)
    }

    const jsContent = await response.text()

    const zip = new JSZip()
    zip.file("index.js", jsContent)

    const zipped = await zip.generateAsync({ type: "uint8array" })

    return zipped
}

async function createLambdaFromJSFile(
    zipBuffer: Uint8Array,
    functionName: string,
    awsAccessKeyId: string,
    awsSecretAccessKey: string,
    privateKey: string,
    secrets: Secrets, // TODO: add server HMAC key to secrets
    roleArn: string,
    dvpAssetsValidatorAddr: string
): Promise<string> {
    const lambdaClient = new LambdaClient({
        region: AWS_REGION,
        credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey
        }
    })

    const env: Record<string, string> = {
        PRIVATE_KEY: privateKey,
        BLOCKFROST_API_KEY: secrets.blockfrostApiKey,
        PLATFORM_KEY: "",
        DVP_ASSETS_VALIDATOR_ADDRESS: dvpAssetsValidatorAddr
    }

    try {
        await lambdaClient.send(
            new UpdateFunctionCodeCommand({
                FunctionName: functionName,
                ZipFile: zipBuffer
            })
        )

        await new Promise((resolve) => setTimeout(resolve, 5000))

        await lambdaClient.send(
            new UpdateFunctionConfigurationCommand({
                FunctionName: functionName,
                Environment: {
                    Variables: env
                }
            })
        )
    } catch (err: any) {
        if (
            err.name !== "NoSuchEntityException" &&
            !err.message.toLowerCase().includes("not found")
        ) {
            throw err
        }

        try {
            const result = await lambdaClient.send(
                new CreateFunctionCommand({
                    FunctionName: functionName,
                    Runtime: NODEJS_RUNTIME,
                    Role: roleArn,
                    Handler: "index.handler",
                    Code: {
                        ZipFile: zipBuffer
                    },
                    Description: "PBG Oracle created from browser",
                    Timeout: 30,
                    MemorySize: 512,
                    Publish: true,
                    Environment: {
                        Variables: env
                    }
                })
            )

            console.log("Lambda function created:", result.FunctionArn)

            // wait for 10s so the next step definitely has access to the role
            await new Promise((resolve) => setTimeout(resolve, 10000))

            await lambdaClient.send(
                new AddPermissionCommand({
                    FunctionName: functionName,
                    StatementId: "PublicInvokePermission",
                    Action: "lambda:InvokeFunctionUrl",
                    Principal: "*",
                    FunctionUrlAuthType: "NONE"
                })
            )
        } catch (err) {
            console.error("Failed to create Lambda function:", err)
            throw err
        }
    }

    try {
        const response = await lambdaClient.send(
            new UpdateFunctionUrlConfigCommand({
                FunctionName: functionName,
                AuthType: "NONE",
                Cors: {
                    AllowOrigins: ["*"], // adjust as needed
                    AllowMethods: ["*"],
                    AllowHeaders: ["*"],
                    AllowCredentials: true
                }
            })
        )

        if (response.FunctionUrl) {
            console.log("Function url: ", response)
            return response.FunctionUrl
        }
    } catch (err: any) {
        if (
            err.name != "NoSuchEntityException" &&
            !err.message.includes("does not exist")
        ) {
            console.error(err, err.name)
            throw err
        }
    }

    const response = await lambdaClient.send(
        new CreateFunctionUrlConfigCommand({
            FunctionName: functionName,
            AuthType: "NONE",
            Cors: {
                AllowOrigins: ["*"], // adjust as needed
                AllowMethods: ["*"],
                AllowHeaders: ["*"],
                AllowCredentials: true
            }
        })
    )

    if (response.FunctionUrl) {
        console.log("Lambda Function URL created:", response)

        return response.FunctionUrl
    } else {
        throw new Error("unable to create lambda function URL")
    }
}

async function getOrCreateBasicLambdaRole(
    roleName: string,
    awsAccessKeyId: string,
    awsSecretAccessKey: string
): Promise<string> {
    const iamClient = new IAMClient({
        region: AWS_REGION,
        credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey
        }
    })

    try {
        const existingRole = await iamClient.send(
            new GetRoleCommand({
                RoleName: roleName
            })
        )

        if (existingRole.Role?.Arn) {
            return existingRole.Role?.Arn
        }
    } catch (error: any) {
        if (error.name !== "NoSuchEntityException") {
            console.error("Failed to check role:", error)
            throw error
        }
    }

    const newRole = await iamClient.send(
        new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Principal: {
                            Service: "lambda.amazonaws.com"
                        },
                        Action: "sts:AssumeRole"
                    }
                ]
            }),
            Description: "PBG Oracle validator (only needs logging)"
        })
    )

    await iamClient.send(
        new AttachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn:
                "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        })
    )

    if (newRole.Role?.Arn) {
        console.log(
            "Created and attached policy to new role:",
            newRole.Role?.Arn
        )

        // wait a bit
        await new Promise((resolve) => setTimeout(resolve, 5000))

        return newRole.Role.Arn
    } else {
        throw new Error(`unable to find/create role ${roleName}`)
    }
}

async function syncFunctionURL(
    functionURL: string,
    stageURL: string,
    privateKey: string
): Promise<void> {
    const schnorrSecp256k1PublicKey = deriveSchnorrPublicKey(privateKey)
    const ecdsaSecp256k1PublicKey = deriveECDSAPublicKey(privateKey)

    const url = `${stageURL}/subscribe`
    const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: {
            Authorization: createAuthToken(privateKey)
        },
        body: JSON.stringify({
            subscription: JSON.stringify({
                endpoint: functionURL
            }), // TODO: simplify this if no other fields are needed
            isPrimary: false, // TODO: remove this field
            schnorrSecp256k1PublicKey,
            ecdsaSecp256k1PublicKey
        })
    })

    if (!response.ok) {
        throw new Error(`failed to fetch ${url}`)
    }
}

// undefined return value signifies unauthorized
async function fetchPlatformSecrets(
    platformURL: string,
    privateKey: string
): Promise<Secrets> {
    const url = `${platformURL}/secrets`

    const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        headers: {
            Authorization: createAuthToken(privateKey)
        }
    })

    const data = await response.text()

    return JSON.parse(data) as Secrets // TODO: type-safe
}
