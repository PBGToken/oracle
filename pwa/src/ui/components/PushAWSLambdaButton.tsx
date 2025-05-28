import { useCallback } from "react"
import { useAWSAccessKey, usePushAWSLambda } from "../hooks"
import { Button } from "./Button"
import { Spinner } from "./Spinner"
import { StageName } from "../hooks/stages"

type ChangeAWSKeyButtonProps = {
    stage: StageName
}

export function PushAWSLambdaButton({ stage }: ChangeAWSKeyButtonProps) {
    const [[pubKey, _privateKey]] = useAWSAccessKey()
    const mutation = usePushAWSLambda()

    const handlePush = useCallback(() => {
        mutation.mutate({ stage })
    }, [mutation])

    if (pubKey == "") {
        return <></>
    } else {
        return (
            <>
                <Button disabled={mutation.isPending} onClick={handlePush}>
                    {mutation.isPending ? (
                        <Spinner />
                    ) : (
                        "Push AWS Lambda function"
                    )}
                </Button>
                {mutation.error && <p>{mutation.error.message}</p>}
            </>
        )
    }
}
