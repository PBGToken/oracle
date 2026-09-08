import { useState } from "react"
import styled from "styled-components"
import type { CloudProvider } from "../../cloud"
import { useAWSAccessKey } from "../hooks/useAWSAccessKey"
import { useCloudConfig } from "../hooks/useCloudConfig"
import { Button } from "./Button"
import { ErrorMessage } from "./ErrorMessage"
import { Spinner } from "./Spinner"

export function CloudProviderForm({ onClose }: { onClose: () => void }) {
    const [cloudConfig, saveCloudConfig] = useCloudConfig()
    const [[savedAWSKey, savedAWSSecret], saveAWSAccessKey] = useAWSAccessKey()
    const [provider, setProvider] = useState<CloudProvider>(
        cloudConfig.provider
    )
    const [awsKey, setAWSKey] = useState(savedAWSKey)
    const [awsSecret, setAWSSecret] = useState(savedAWSSecret)
    const [netlifyToken, setNetlifyToken] = useState(cloudConfig.netlifyToken)
    const [error, setError] = useState("")
    const pending = saveCloudConfig.isPending || saveAWSAccessKey.isPending
    const valid =
        provider == "aws"
            ? awsKey.trim() != "" && awsSecret.trim() != ""
            : netlifyToken.trim() != ""

    return (
        <Form
            onSubmit={async (event) => {
                event.preventDefault()
                if (!valid || pending) return
                setError("")
                try {
                    if (provider == "aws") {
                        await saveAWSAccessKey.mutateAsync([
                            awsKey.trim(),
                            awsSecret.trim()
                        ])
                    }
                    await saveCloudConfig.mutateAsync({
                        ...cloudConfig,
                        provider,
                        netlifyToken: netlifyToken.trim()
                    })
                    onClose()
                } catch (error) {
                    setError(
                        error instanceof Error
                            ? error.message
                            : "Unable to save cloud settings"
                    )
                }
            }}
        >
            <h2>Cloud deployment</h2>
            <label>
                Cloud provider
                <select
                    value={provider}
                    onChange={(event) =>
                        setProvider(event.target.value as CloudProvider)
                    }
                    disabled={pending}
                >
                    <option value="aws">AWS Lambda</option>
                    <option value="netlify">Netlify Functions</option>
                </select>
            </label>

            {provider == "aws" ? (
                <>
                    <label>
                        AWS access key
                        <input
                            value={awsKey}
                            onChange={(event) => setAWSKey(event.target.value)}
                            autoComplete="off"
                            disabled={pending}
                        />
                    </label>
                    <label>
                        AWS secret access key
                        <input
                            type="password"
                            value={awsSecret}
                            onChange={(event) =>
                                setAWSSecret(event.target.value)
                            }
                            autoComplete="off"
                            disabled={pending}
                        />
                    </label>
                </>
            ) : (
                <label>
                    Netlify personal access token
                    <input
                        type="password"
                        value={netlifyToken}
                        onChange={(event) =>
                            setNetlifyToken(event.target.value)
                        }
                        autoComplete="off"
                        disabled={pending}
                    />
                </label>
            )}

            <ErrorMessage>{error}</ErrorMessage>
            <Actions>
                <Button type="submit" disabled={!valid || pending}>
                    {pending ? <Spinner /> : "Save"}
                </Button>
                <Button
                    type="button"
                    onClick={onClose}
                    $secondary
                    disabled={pending}
                >
                    Cancel
                </Button>
            </Actions>
        </Form>
    )
}

const Form = styled.form`
    background: ${({ theme }) => theme.colors.panelBg};
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;

    label {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    input,
    select {
        box-sizing: border-box;
        font-size: 16px;
        min-height: 44px;
        padding: 8px;
        width: 100%;
    }
`

const Actions = styled.div`
    display: flex;
    gap: 12px;
`
