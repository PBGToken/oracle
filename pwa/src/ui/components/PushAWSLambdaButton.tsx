import { useCallback } from "react"
import { useAWSAccessKey, usePushAWSLambda } from "../hooks"
import { Button } from "./Button"
import { Spinner } from "./Spinner"

type ChangeAWSKeyButtonProps = {}

export function PushAWSLambdaButton({}: ChangeAWSKeyButtonProps) {
    const [[pubKey, _privateKey]] = useAWSAccessKey()
    const mutation = usePushAWSLambda()

    const handlePush = useCallback(() => {
        mutation.mutate(undefined)
    }, [mutation])

    if (pubKey == "") {
        return <></>
    } else {
        return (
            <Button disabled={mutation.isPending} onClick={handlePush}>
                {mutation.isPending ? <Spinner /> : "Push AWS Lambda function"}
            </Button>
        )
    }
}
