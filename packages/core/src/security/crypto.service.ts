import { hkdf } from "node:crypto";
import getSodium from "./sodium";

export class CryptoService {
	// Key generation
	async generateKey(length: number): Promise<Uint8Array> {
		const sodium = await getSodium();
		return sodium.randombytes_buf(length);
	}

	// AEAD encryption/decryption using XChaCha20-Poly1305
	async aeadEncrypt(
		plaintext: string | Uint8Array,
		nonce: Uint8Array,
		key: Uint8Array,
		aad?: string | Uint8Array,
	): Promise<Uint8Array> {
		const sodium = await getSodium();
		return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
			plaintext,
			aad || null,
			null,
			nonce,
			key,
		);
	}

	async aeadDecrypt(
		ciphertext: Uint8Array,
		nonce: Uint8Array,
		key: Uint8Array,
		aad?: string | Uint8Array,
	): Promise<Uint8Array> {
		const sodium = await getSodium();
		return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
			null,
			ciphertext,
			aad || null,
			nonce,
			key,
		);
	}

	// Key derivation using Argon2id for PIN
	async deriveKeyFromPin(
		pin: string,
		salt: Uint8Array,
	): Promise<Uint8Array> {
		const sodium = await getSodium();
		return sodium.crypto_pwhash(
			32, // output length
			pin,
			salt,
			3, // opslimit (time)
			134217728, // memlimit (128 MiB)
			sodium.crypto_pwhash_ALG_DEFAULT, // algorithm
		);
	}

	// Key derivation from WebAuthn assertion
	async deriveKeyFromWebAuthn(
		clientDataJSON: string,
		credentialId: string, // base64url
		signature: string, // base64url
		salt: Uint8Array,
	): Promise<Uint8Array> {
		const sodium = await getSodium();
		const challenge = JSON.parse(clientDataJSON).challenge;

		const challengeBytes = sodium.from_base64(
			challenge,
			sodium.base64_variants.URLSAFE_NO_PADDING,
		);
		const credentialIdBytes = sodium.from_base64(
			credentialId,
			sodium.base64_variants.URLSAFE_NO_PADDING,
		);
		const signatureBytes = sodium.from_base64(
			signature,
			sodium.base64_variants.URLSAFE_NO_PADDING,
		);

		const ikm = new Uint8Array(
			challengeBytes.length + credentialIdBytes.length + signatureBytes.length,
		);
		ikm.set(challengeBytes, 0);
		ikm.set(credentialIdBytes, challengeBytes.length);
		ikm.set(
			signatureBytes,
			challengeBytes.length + credentialIdBytes.length,
		);

		return new Promise((resolve, reject) => {
			hkdf(
				"sha256",
				ikm,
				salt,
				"ccflare-webauthn-kek",
				32,
				(err, derivedKey) => {
					if (err) {
						reject(err);
					} else {
						resolve(new Uint8Array(derivedKey));
					}
				},
			);
		});
	}

	// Key wrapping and unwrapping
	async wrapKey(
		keyToWrap: Uint8Array,
		wrappingKey: Uint8Array,
	): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
		const sodium = await getSodium();
		const nonce = await this.generateKey(
			sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
		);
		const ciphertext = await this.aeadEncrypt(keyToWrap, nonce, wrappingKey);
		return { ciphertext, nonce };
	}

	async unwrapKey(
		ciphertext: Uint8Array,
		nonce: Uint8Array,
		wrappingKey: Uint8Array,
	): Promise<Uint8Array> {
		return this.aeadDecrypt(ciphertext, nonce, wrappingKey);
	}

	deriveInteractionKey(
		dek: Uint8Array,
		keyNonce: Uint8Array,
	): Promise<Uint8Array> {
		return new Promise((resolve, reject) => {
			hkdf("sha256", dek, keyNonce, "coldproxy/v1", 32, (err, derivedKey) => {
				if (err) {
					reject(err);
				} else {
					resolve(new Uint8Array(derivedKey));
				}
			});
		});
	}
}
