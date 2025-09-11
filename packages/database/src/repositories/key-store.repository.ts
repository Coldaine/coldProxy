import type { Database } from "bun:sqlite";
import { BaseRepository } from "./base.repository";

export interface KeyStoreItem {
    id: string;
    type: string;
    blob: Buffer;
    nonce: string;
    meta: string | null;
}

export class KeyStoreRepository extends BaseRepository<KeyStoreItem> {
    constructor(db: Database) {
        super(db);
    }

    create(item: KeyStoreItem): void {
        this.run(
            "INSERT INTO key_store (id, type, blob, nonce, meta) VALUES (?, ?, ?, ?, ?)",
            [item.id, item.type, item.blob, item.nonce, item.meta],
        );
    }

    findById(id: string): KeyStoreItem | null {
        return this.get<KeyStoreItem>(
            "SELECT * FROM key_store WHERE id = ?",
            [id],
        );
    }

    findByType(type: string): KeyStoreItem[] {
        return this.query<KeyStoreItem>(
            "SELECT * FROM key_store WHERE type = ?",
            [type],
        );
    }

    update(id: string, blob: Buffer, nonce: string, meta?: string | null): void {
        this.run(
            "UPDATE key_store SET blob = ?, nonce = ?, meta = ? WHERE id = ?",
            [blob, nonce, meta || null, id],
        );
    }

    delete(id: string): void {
        this.run("DELETE FROM key_store WHERE id = ?", [id]);
    }

    hasMasterKey(): boolean {
        const result = this.get<{ count: number }>(
            "SELECT COUNT(*) as count FROM key_store WHERE type LIKE 'master_key_%'"
        );
        return result ? result.count > 0 : false;
    }
}
