import { useCallback } from "react"
import styled from "styled-components"
import { useAWSAccessKey } from "../hooks/useAWSAccessKey"
import { useCloudConfig } from "../hooks/useCloudConfig"
import { useDeployNetlify } from "../hooks/useDeployNetlify"
import { useDeployVercel } from "../hooks/useDeployVercel"
import { usePrivateKey } from "../hooks/usePrivateKey"
import { usePushAWSLambda } from "../hooks/usePushAWSLambda"
import type { StageName } from "../hooks/stages"
import { Button } from "./Button"
import { ErrorMessage } from "./ErrorMessage"
import { Spinner } from "./Spinner"

export function DeployValidatorButton({ stage }: { stage: StageName }) {
    const [cloudConfig] = useCloudConfig()
    const [[awsKey]] = useAWSAccessKey()
    const [privateKey] = usePrivateKey()
    const aws = usePushAWSLambda()
    const netlify = useDeployNetlify()
    const vercel = useDeployVercel()
    const mutation =
        cloudConfig.provider == "netlify"
            ? netlify
            : cloudConfig.provider == "vercel"
              ? vercel
              : aws
    const deploymentStep =
        cloudConfig.provider == "netlify"
            ? netlify.deploymentStep
            : cloudConfig.provider == "vercel"
              ? vercel.deploymentStep
              : ""
    const configured =
        privateKey != "" &&
        (cloudConfig.provider == "netlify"
            ? cloudConfig.netlifyToken != ""
            : cloudConfig.provider == "vercel"
              ? cloudConfig.vercelToken != ""
              : awsKey != "")

    const deploy = useCallback(() => {
        mutation.mutate({ stage })
    }, [mutation, stage])

    if (!configured) return null

    return (
        <>
            <Button disabled={mutation.isPending} onClick={deploy}>
                {mutation.isPending ? <Spinner /> : "Deploy"}
            </Button>
            {mutation.isPending && deploymentStep && <p>{deploymentStep}…</p>}
            {mutation.error && (
                <DeploymentError>{mutation.error.message}</DeploymentError>
            )}
        </>
    )
}

const DeploymentError = styled(ErrorMessage)`
    overflow-wrap: anywhere;
    white-space: pre-wrap;
`
