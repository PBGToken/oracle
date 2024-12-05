import { ChangeEvent, useState } from "react"
import styled from "styled-components"
import { bytesToHex } from "@helios-lang/codec-utils"
import { BIP39_DICT_EN, restoreRootPrivateKey } from "@helios-lang/tx-utils"
import { useDeviceId, usePrivateKey } from "../hooks"
import { Button } from "./Button"
import { ErrorMessage } from "./ErrorMessage"

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
            setDeviceId(Date.now())
            setPrivateKey(bytesToHex(signingKey.bytes))

            onClose()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    return (
        <StyledKeyInput>
            <Grid>
                {words.map((w, i) => {
                    const id = (i + 1).toString()
                    return (
                        <Group key={i}>
                            <Label htmlFor={id}>{id}</Label>

                            <Input
                                id={id}
                                name={id}
                                value={w}
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
            </Grid>

            <Button disabled={!isValid} onClick={handleSave}>
                Save
            </Button>
            <Button onClick={onClose} $secondary={true}>
                Cancel
            </Button>

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
`

const Grid = styled.div`
    display: grid;
    grid-template-columns: auto auto auto;
`

const Group = styled.div`
    align-items: center;
    display: flex;
    flex-direction: row;
    max-width: 150px;
`

const Label = styled.label`
    width: 20px;
`

const Input = styled.input`
    flex-grow: 1;
    height: 40px;
`
