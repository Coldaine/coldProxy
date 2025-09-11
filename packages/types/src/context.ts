import type { Database } from "bun:sqlite";
import type { Config } from "@ccflare/config";
import type { Database } from "bun:sqlite";
import type { Config } from "@ccflare/config";
import type { DatabaseOperations } from "@ccflare/database";
import type { SetupService, UnlockService } from "@ccflare/core";
import type { Logger } from "@ccflare/logger";
import type { Account } from "./account";
import type { RequestMeta } from "./api";
import type { StrategyStore } from "./strategy";

// API context for HTTP handlers
export interface APIContext {
	db: Database;
	config: Config;
	dbOps: DatabaseOperations;
	unlockService: UnlockService;
	setupService: SetupService;
	logger: Logger;
}

// Load balancing strategy interface
export interface LoadBalancingStrategy {
	/**
	 * Return a filtered & ordered list of candidate accounts.
	 * Accounts that are rate-limited should be filtered out.
	 * The first account in the list should be tried first.
	 */
	select(accounts: Account[], meta: RequestMeta): Account[];

	/**
	 * Optional initialization method to inject dependencies
	 * Used for strategies that need access to a StrategyStore
	 */
	initialize?(store: StrategyStore): void;
}
