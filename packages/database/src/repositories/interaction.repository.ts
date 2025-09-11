import type { Database } from "bun:sqlite";
import { BaseRepository } from "./base.repository";

export interface Interaction {
    id: string;
    user_id: string;
    created_at: number;
    model: string | null;
    tokens: number | null;
    cost_usd: number | null;
    cipher_key_version: number;
    request_fingerprint: string | null;
    chunk_count: number | null;
    byte_count: number | null;
    truncated: boolean | null;
}

export class InteractionRepository extends BaseRepository<Interaction> {
    constructor(db: Database) {
        super(db);
    }

    create(interaction: Interaction): void {
        this.run(
            "INSERT INTO interactions (id, user_id, created_at, model, tokens, cost_usd, cipher_key_version, request_fingerprint, chunk_count, byte_count, truncated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                interaction.id,
                interaction.user_id,
                interaction.created_at,
                interaction.model,
                interaction.tokens,
                interaction.cost_usd,
                interaction.cipher_key_version,
                interaction.request_fingerprint,
                interaction.chunk_count,
                interaction.byte_count,
                interaction.truncated,
            ],
        );
    }

    findById(id: string): Interaction | null {
        return this.get<Interaction>(
            "SELECT * FROM interactions WHERE id = ?",
            [id],
        );
    }

    findByUserId(userId: string, limit = 50): Interaction[] {
        return this.query<Interaction>(
            "SELECT * FROM interactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            [userId, limit],
        );
    }
}
