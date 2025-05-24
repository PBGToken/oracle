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

const region = "us-east-1"

export function usePushAWSLambda(): UseMutationResult<
    void,
    Error,
    undefined,
    undefined
> {
    const [[awsAccessKey, awsSecretAccessKey]] = useAWSAccessKey()
    const [privateKey] = usePrivateKey()

    return useMutation({
        mutationKey: ["aws-lambda"],
        mutationFn: async () => {
            if (
                awsAccessKey == "" ||
                awsSecretAccessKey == "" ||
                privateKey == ""
            ) {
                return
            }

            const zipBuffer = await getZipFromUrl()
            const roleArn = await getOrCreateBasicLambdaRole(
                awsAccessKey,
                awsSecretAccessKey
            )

            await createLambdaFromJSFile(
                zipBuffer,
                "PBGOracleValidator",
                awsAccessKey,
                awsSecretAccessKey,
                privateKey,
                roleArn
            )
        }
    })
}

async function getZipFromUrl(): Promise<Uint8Array> {
    const jsContent = await fetch("/aws-validator.js").then((res) => res.text())

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
    roleArn: string
): Promise<string> {
    const lambdaClient = new LambdaClient({
        region,
        credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey
        }
    })

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
                    Variables: {
                        PRIVATE_KEY: privateKey
                    }
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
                    Runtime: "nodejs18.x",
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
                        Variables: {
                            PRIVATE_KEY: privateKey
                        }
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
    awsAccessKeyId: string,
    awsSecretAccessKey: string
): Promise<string> {
    const roleName = "PBGOracleValidatorRole"

    const iamClient = new IAMClient({
        region,
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

        return newRole.Role.Arn
    } else {
        throw new Error(`unable to find/create role ${roleName}`)
    }
}
