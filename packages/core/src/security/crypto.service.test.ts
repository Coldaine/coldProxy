import { CryptoService } from "./crypto.service";
import getSodium from "./sodium";
import { expect, test, describe, beforeAll } from "bun:test";

describe("CryptoService", () => {
	beforeAll(async () => {
		await getSodium();
	});

	const crypto = new CryptoService();

	test("should generate a key of the specified length", async () => {
		const key = await crypto.generateKey(32);
		expect(key.length).toBe(32);
	});

	test("should encrypt and decrypt a message", async () => {
		const key = await crypto.generateKey(32);
		const nonce = await crypto.generateKey(24);
		const message = "hello world";
		const ciphertext = await crypto.aeadEncrypt(message, nonce, key);
		const decrypted = await crypto.aeadDecrypt(ciphertext, nonce, key);
		expect(new TextDecoder().decode(decrypted)).toBe(message);
	});

	test("should fail to decrypt with wrong key", async () => {
		const key1 = await crypto.generateKey(32);
		const key2 = await crypto.generateKey(32);
		const nonce = await crypto.generateKey(24);
		const message = "hello world";
		const ciphertext = await crypto.aeadEncrypt(message, nonce, key1);
		let thrown = false;
		try {
			await crypto.aeadDecrypt(ciphertext, nonce, key2);
		} catch (e) {
			thrown = true;
		}
		expect(thrown).toBe(true);
	});

	test("should derive a key from a PIN", async () => {
		const pin = "1234";
		const salt = await crypto.generateKey(16);
		const key = await crypto.deriveKeyFromPin(pin, salt);
		expect(key.length).toBe(32);
	});

	test("should derive an interaction key", async () => {
		const sodium = await getSodium();
		console.log(Object.keys(sodium));

		const dek = await crypto.generateKey(32);
		const keyNonce = await crypto.generateKey(24);
		const sk = await crypto.deriveInteractionKey(dek, keyNonce);
		expect(sk.length).toBe(32);
	});
});
