import type { DatabaseOperations } from "@ccflare/database";
import { CryptoService } from "./crypto.service";

export class SetupService {
	private dbOps: DatabaseOperations;
	private crypto: CryptoService;

	constructor(dbOps: DatabaseOperations, crypto: CryptoService) {
		this.dbOps = dbOps;
		this.crypto = crypto;
	}

	async setPin(userId: string, pin: string): Promise<void> {
		const keyStore = this.dbOps.getKeyStoreRepository();

		// For simplicity, we assume per-user MK and DEK.
		// A more complex system might share an MK, but that requires more complex key management.
		const mk = await this.crypto.generateKey(32);
		const dek = await this.crypto.generateKey(32);

		// Wrap DEK with MK
		const wrappedDek = await this.crypto.wrapKey(dek, mk);
		keyStore.create({
			id: `dek_${userId}`,
			type: "data_encryption_key",
			blob: Buffer.from(wrappedDek.ciphertext),
			nonce: Buffer.from(wrappedDek.nonce).toString("hex"),
			meta: JSON.stringify({ version: 1 }),
		});

		// Derive KEK from PIN
		const salt = await this.crypto.generateKey(16);
		const kek = await this.crypto.deriveKeyFromPin(pin, salt);

		// Wrap MK with KEK and store it
		const wrappedMk = await this.crypto.wrapKey(mk, kek);
		keyStore.create({
			id: `mk_pin_${userId}`,
			type: "master_key_pin",
			blob: Buffer.from(wrappedMk.ciphertext),
			nonce: Buffer.from(wrappedMk.nonce).toString("hex"),
			meta: JSON.stringify({ salt: Buffer.from(salt).toString("hex") }),
		});
	}
}
