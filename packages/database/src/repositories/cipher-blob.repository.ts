import type { Database } from "bun:sqlite";
import { BaseRepository } from "./base.repository";

export interface CipherBlob {
    id: string;
    interaction_id: string;
    chunk_index: number;
    nonce: string;
    ciphertext: Buffer;
}

export class CipherBlobRepository extends BaseRepository<CipherBlob> {
    constructor(db: Database) {
        super(db);
    }

    create(blob: CipherBlob): void {
        this.run(
            "INSERT INTO cipher_blobs (id, interaction_id, chunk_index, nonce, ciphertext) VALUES (?, ?, ?, ?, ?)",
            [blob.id, blob.interaction_id, blob.chunk_index, blob.nonce, blob.ciphertext],
        );
    }

    findByInteractionId(interactionId: string): CipherBlob[] {
        return this.query<CipherBlob>(
            "SELECT * FROM cipher_blobs WHERE interaction_id = ? ORDER BY chunk_index ASC",
            [interactionId],
        );
    }

    deleteByInteractionId(interactionId: string): void {
        this.run("DELETE FROM cipher_blobs WHERE interaction_id = ?", [interactionId]);
    }
}
