import { usePrivateKey } from "../hooks"
import { Button } from "./Button"

type ChangeKeyButtonProps = {
    onChange: () => void
}

export function ChangeKeyButton({ onChange }: ChangeKeyButtonProps) {
    const [privateKey] = usePrivateKey()

    return (
        <Button onClick={onChange}>
            {privateKey == "" ? "Set Signing Key" : "Change Signing Key"}
        </Button>
    )
}
