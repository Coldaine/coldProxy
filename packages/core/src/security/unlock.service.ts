import type { DatabaseOperations } from "@ccflare/database";
import { CryptoService } from "./crypto.service";

export class UnlockService {
    private dbOps: DatabaseOperations;
    private crypto: CryptoService;
    private mkCache: Map<string, { key: Uint8Array; expires: number }> = new Map();
    private readonly mkCacheTTL = 30 * 60 * 1000; // 30 minutes

    constructor(dbOps: DatabaseOperations, crypto: CryptoService) {
        this.dbOps = dbOps;
        this.crypto = crypto;
    }

    // In-memory cache for the master key
    private getMasterKeyFromCache(userId: string): Uint8Array | null {
        const cached = this.mkCache.get(userId);
        if (cached && cached.expires > Date.now()) {
            // Reset TTL on access
            cached.expires = Date.now() + this.mkCacheTTL;
            return cached.key;
        }
        this.mkCache.delete(userId);
        return null;
    }

    private setMasterKeyInCache(userId: string, key: Uint8Array): void {
        if (this.mkCache.size >= 100) {
            // Simple cache eviction strategy: remove the oldest entry
            const oldestKey = this.mkCache.keys().next().value;
            this.mkCache.delete(oldestKey);
        }
        this.mkCache.set(userId, { key, expires: Date.now() + this.mkCacheTTL });
    }

    private pinFailures: Map<string, { count: number; lastAttempt: number }> = new Map();
    private readonly pinLockoutDuration = 15 * 60 * 1000; // 15 minutes
    private readonly maxPinAttempts = 5;

    async unlockWithPin(userId: string, pin: string): Promise<boolean> {
        const failureInfo = this.pinFailures.get(userId);
        if (failureInfo && failureInfo.count >= this.maxPinAttempts && Date.now() - failureInfo.lastAttempt < this.pinLockoutDuration) {
            throw new Error("Account is locked due to too many failed PIN attempts.");
        }

        const keyStore = this.dbOps.getKeyStoreRepository();
        const wrappedMkItem = keyStore.findById(`mk_pin_${userId}`);

        if (!wrappedMkItem || !wrappedMkItem.meta) {
            // To prevent user enumeration, we should perform a dummy key derivation
            await this.crypto.deriveKeyFromPin(pin, this.crypto.generateKey(16));
            return false;
        }

        const { salt: saltHex } = JSON.parse(wrappedMkItem.meta);
        const salt = Buffer.from(saltHex, "hex");

        const kek = await this.crypto.deriveKeyFromPin(pin, salt);

        try {
            const mk = this.crypto.unwrapKey(Buffer.from(wrappedMkItem.blob), Buffer.from(wrappedMkItem.nonce, "hex"), kek);
            this.setMasterKeyInCache(userId, mk);
            this.pinFailures.delete(userId); // Clear failures on success
            return true;
        } catch (error) {
            // Handle unlock failure
            const newFailureInfo = {
                count: (failureInfo?.count || 0) + 1,
                lastAttempt: Date.now(),
            };
            this.pinFailures.set(userId, newFailureInfo);
            return false;
        }
    }

    async generateWebAuthnChallenge(userId: string): Promise<{ options: any, challenge: string }> {
        const keyStore = this.dbOps.getKeyStoreRepository();
        const fido2Keys = keyStore.findByType(`fido2_${userId}`);

        const allowCredentials = fido2Keys.map(key => {
            const { credentialID } = JSON.parse(key.meta || '{}');
            return {
                id: Buffer.from(credentialID, 'base64'),
                type: 'public-key' as const,
            };
        });

        const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
        const options = await generateAuthenticationOptions({
            allowCredentials,
            userVerification: 'required',
        });

        return { options, challenge: options.challenge };
    }

    async unlockWithWebAuthn(
        userId: string,
        assertionResponse: any,
        expectedChallenge: string,
        rpID: string,
        rpOrigin: string,
    ): Promise<boolean> {
        const keyStore = this.dbOps.getKeyStoreRepository();
        const fido2Key = keyStore.findById(`fido2_${userId}_${assertionResponse.id}`);

        if (!fido2Key || !fido2Key.meta) {
            return false;
        }

        const { credentialID, credentialPublicKey, counter } = JSON.parse(fido2Key.meta);

        const authenticator = {
            credentialID: Buffer.from(credentialID, 'base64'),
            credentialPublicKey: Buffer.from(credentialPublicKey, 'base64'),
            counter,
            transports: [], // Not needed for verification
        };

        const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
        const { verified, authenticationInfo } = await verifyAuthenticationResponse({
            response: assertionResponse,
            expectedChallenge,
            expectedOrigin: rpOrigin,
            expectedRPID: rpID,
            authenticator,
        });

        if (!verified) {
            return false;
        }

        // Update the counter
        const newMeta = { ...JSON.parse(fido2Key.meta), counter: authenticationInfo.newCounter };
        keyStore.update(fido2Key.id, fido2Key.blob, fido2Key.nonce, JSON.stringify(newMeta));

        const { salt: saltHex } = JSON.parse(fido2Key.meta);
        const salt = Buffer.from(saltHex, "hex");

        const kek = await this.crypto.deriveKeyFromWebAuthn(
            assertionResponse.response.clientDataJSON,
            assertionResponse.id,
            assertionResponse.response.signature,
            salt,
        );

        const wrappedMkItem = keyStore.findById(`mk_fido_${userId}`);
        if (!wrappedMkItem) {
            return false;
        }

        const mk = this.crypto.unwrapKey(Buffer.from(wrappedMkItem.blob), Buffer.from(wrappedMkItem.nonce, "hex"), kek);
        this.setMasterKeyInCache(userId, mk);

        return true;
    }

    getDecryptedDek(userId: string): Uint8Array | null {
        const mk = this.getMasterKeyFromCache(userId);
        if (!mk) {
            return null;
        }

        const keyStore = this.dbOps.getKeyStoreRepository();
        const wrappedDekItem = keyStore.findById(`dek_${userId}`);

        if (!wrappedDekItem) {
            return null;
        }

        try {
            const dek = this.crypto.unwrapKey(Buffer.from(wrappedDekItem.blob), Buffer.from(wrappedDekItem.nonce, "hex"), mk);
            return dek;
        } catch (error) {
            // Decryption failed
            return null;
        }
    }

    async rotateMasterKey(): Promise<void> {
        // To be implemented
        throw new Error("Not implemented");
    }

    async generateRecoveryCode(userId: string): Promise<string> {
        // To be implemented
        throw new Error("Not implemented");
    }

    async recoverMasterKey(userId: string, recoveryCode: string): Promise<boolean> {
        // To be implemented
        return false;
    }
}
