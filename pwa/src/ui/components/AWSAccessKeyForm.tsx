import { ChangeEvent, useCallback, useState } from "react"
import styled from "styled-components"
import { useAWSAccessKey } from "../hooks"
import { Button } from "./Button"
import { ErrorMessage } from "./ErrorMessage"
import { Spinner } from "./Spinner"

type KeyInputProps = {
    onClose: () => void
}

export function AWSAccessKeyForm({ onClose }: KeyInputProps) {
    const setAWSAccessKey = useAWSAccessKey()[1]
    const [key, setKey] = useState("")
    const [secretKey, setSecretKey] = useState("")
    const [error, setError] = useState("")
    const isValid = true

    const handleSave = useCallback(() => {
        setAWSAccessKey.mutate([key, secretKey], {
            onSuccess: onClose,
            onError: (error) => {
                setError(`Failed to set private key, ${error.message}`)
            }
        })
    }, [setAWSAccessKey, key, secretKey, onClose, setError])

    return (
        <StyledKeyInput>
            <Layout>
                <h2>Set AWS Key</h2>
                <Group>
                    <Label htmlFor="key">Access key</Label>

                    <Input
                        id="key"
                        name="key"
                        value={key}
                        $isError={key.length > 0 && key.length != 20}
                        $isValid={isValid}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            setKey(e.target.value)
                        }}
                    />
                </Group>

                <Group>
                    <Label htmlFor="secret">Secret</Label>

                    <Input
                        id="secret"
                        name="secret"
                        value={secretKey}
                        $isError={
                            secretKey.length > 0 && secretKey.length != 40
                        }
                        $isValid={isValid}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            setSecretKey(e.target.value)
                        }}
                    />
                </Group>
            </Layout>

            <ErrorMessage>{error}</ErrorMessage>

            <Row>
                <Button disabled={!isValid} onClick={handleSave}>
                    {setAWSAccessKey.isPending ? <Spinner /> : "Save"}
                </Button>

                <Button onClick={onClose} $secondary={true}>
                    Cancel
                </Button>
            </Row>
        </StyledKeyInput>
    )
}

const StyledKeyInput = styled.div`
    align-items: center;
    background: ${({ theme }) => theme.colors.panelBg};
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    padding: 10px;
    gap: 20px;
`

const Layout = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
`

const Row = styled.div`
    display: flex;
    flex-direction: row;
    gap: 20px;
`

const Group = styled.div`
    align-items: center;
    display: flex;
    flex-direction: row;
`

const Label = styled.label`
    min-width: 30px;
`

type InputProps = {
    $isError: boolean
    $isValid: boolean
}

const Input = styled.input<InputProps>`
    flex-grow: 1;
    height: 50px;
    padding: 0px 10px;
    font-size: 20px;
    border: ${({ $isError, $isValid }) =>
        $isError
            ? "2px solid red"
            : $isValid
              ? "2px solid green"
              : "2px solid #d0d0d0"};
`
