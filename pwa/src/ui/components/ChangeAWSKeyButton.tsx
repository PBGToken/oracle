import { useAWSAccessKey } from "../hooks"
import { Button } from "./Button"

type ChangeAWSKeyButtonProps = {
    onChange: () => void
}

export function ChangeAWSKeyButton({ onChange }: ChangeAWSKeyButtonProps) {
    const [[pubKey, _privateKey]] = useAWSAccessKey()

    return (
        <Button onClick={onChange}>
            {pubKey == "" ? "Set AWS Access Key" : "Change AWS Access Key"}
        </Button>
    )
}
