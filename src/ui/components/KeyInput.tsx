import { ChangeEvent, useState } from "react"
import styled from "styled-components"
import { bytesToHex } from "@helios-lang/codec-utils"
import { BIP39_DICT_EN, restoreRootPrivateKey } from "@helios-lang/tx-utils"
import { useDeviceId, usePrivateKey } from "../hooks"
import { Button } from "./Button"
import { ErrorMessage } from "./ErrorMessage"
import { Spinner } from "./Spinner"

type KeyInputProps = {
    onClose: () => void
}

export function KeyInput({ onClose }: KeyInputProps) {
    const [words, setWords] = useState<string[]>(new Array(24).fill(""))
    const setPrivateKey = usePrivateKey()[1]
    const setDeviceId = useDeviceId()[1]
    const isValid = words.every((w) => BIP39_DICT_EN.indexOf(w) != -1)
    const [error, setError] = useState("")

    const handleSave = () => {
        const phrase = words

        try {
            const rootPrivateKey = restoreRootPrivateKey(phrase)

            const signingKey = rootPrivateKey.deriveSpendingKey()

            // device Id first, because upon setting the private key secrets are immediately fetched

            setDeviceId.mutate(Date.now(), {
                onSuccess: () => {
                    setPrivateKey.mutate(bytesToHex(signingKey.bytes), {
                        onSuccess: onClose
                    })
                }
            })
        } catch (e) {
            setError((e as Error).message)
        }
    }

    return (
        <StyledKeyInput>
            <Layout>
                <h2>Set Key</h2>
                {words.map((w, i) => {
                    const id = (i + 1).toString()
                    const isValid = BIP39_DICT_EN.indexOf(w) != -1
                    return (
                        <Group key={i}>
                            <Label htmlFor={id}>{id}</Label>

                            <Input
                                id={id}
                                name={id}
                                value={w}
                                $isError={w.length > 0 && !isValid}
                                $isValid={isValid}
                                onChange={(
                                    e: ChangeEvent<HTMLInputElement>
                                ) => {
                                    setWords(
                                        words
                                            .slice(0, i)
                                            .concat([e.target.value])
                                            .concat(words.slice(i + 1))
                                    )
                                }}
                            />
                        </Group>
                    )
                })}
            </Layout>

            <Row>
                <Button disabled={!isValid} onClick={handleSave}>
                    {setDeviceId.isPending || setPrivateKey.isPending ? <Spinner/> : "Save"}
                </Button>

                <Button onClick={onClose} $secondary={true}>
                    Cancel
                </Button>
            </Row>

            {error && <ErrorMessage>{error}</ErrorMessage>}
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
    border: ${({$isError, $isValid}) => $isError ? "2px solid red" : $isValid ? "2px solid green" : "2px solid #d0d0d0"};
`
