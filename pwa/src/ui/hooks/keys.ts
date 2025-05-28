import {
    bytesToHex,
    decodeIntBE,
    encodeIntBE,
    hexToBytes
} from "@helios-lang/codec-utils"
import { ECDSASecp256k1, SchnorrSecp256k1 } from "@helios-lang/crypto"

// Both Bitcoin and Ethereum use Secp256k1 private keys
function deriveSecp256k1PrivateKey(privateKey: string): string {
    const s =
        decodeIntBE(hexToBytes(privateKey)) %
        115792089237316195423570985008687907852837564279074904382605163141518161494337n

    return bytesToHex(encodeIntBE(s))
}

export function deriveSchnorrPrivateKey(privateKey: string): string {
    return deriveSecp256k1PrivateKey(privateKey)
}

export function deriveECDSAPrivateKey(privateKey: string): string {
    return deriveSecp256k1PrivateKey(privateKey)
}

// derive Schnorr public key from Ed25519 private key
// Schnorr is used by Bitcoin
export function deriveSchnorrPublicKey(privateKey: string): string {
    return bytesToHex(
        SchnorrSecp256k1.derivePublicKey(
            hexToBytes(deriveSecp256k1PrivateKey(privateKey))
        )
    )
}

// Derive ECDSA public key from Ed25519 private key
// ECDSA is used by Ethereum
export function deriveECDSAPublicKey(privateKey: string): string {
    return bytesToHex(
        ECDSASecp256k1.derivePublicKey(
            hexToBytes(deriveSecp256k1PrivateKey(privateKey))
        )
    )
}
