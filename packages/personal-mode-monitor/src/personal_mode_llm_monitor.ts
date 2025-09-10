import { EventEmitter } from "node:events";
import type { DatabaseOperations } from "@ccflare/database";
import { Logger } from "@ccflare/logger";
import type {
	PersonalAnalytics,
	PersonalQuota,
	PersonalSession,
} from "./types";

/**
 * Personal Mode LLM Monitor
 *
 * Provides privacy-focused, user-centric monitoring capabilities for LLM interactions.
 * Features include conversation tracking, personal quotas, and privacy-preserving analytics.
 */
export class PersonalModeLLMMonitor extends EventEmitter {
	private readonly log: Logger;
	private readonly dbOps: DatabaseOperations;
	private readonly sessions = new Map<string, PersonalSession>();
	private readonly quotas = new Map<string, PersonalQuota>();
	private readonly config: PersonalModeConfig;

	// EventEmitter methods
	emit(event: string, ...args: any[]): boolean {
		return super.emit(event, ...args);
	}

	constructor(dbOps: DatabaseOperations, config: PersonalModeConfig = {}) {
		super();
		this.log = new Logger("PersonalModeLLMMonitor");
		this.dbOps = dbOps;
		this.config = {
			dataRetentionDays: 7,
			maxConversationLength: 100,
			enableAnonymization: true,
			personalQuotaEnabled: true,
			sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
			...config,
		};

		// Only initialize cleanup timer if retention is not disabled
		if (this.config.dataRetentionDays !== -1) {
			this.initializeCleanupTimer();
		}
		this.log.info("Personal Mode LLM Monitor initialized");
	}

	/**
	 * Track a personal LLM interaction
	 */
	public trackInteraction(interaction: PersonalInteraction): void {
		try {
			const { sessionId, userId, requestData, responseData } = interaction;

			// Update or create session
			this.updateSession(sessionId, userId, interaction);

			// Track quota usage if enabled
			if (this.config.personalQuotaEnabled) {
				this.updateQuotaUsage(userId, requestData, responseData);
			}

			// Store interaction with privacy controls
			this.storeInteraction(interaction);

			// Emit event for real-time monitoring
			this.emit("interaction", {
				sessionId,
				userId,
				timestamp: Date.now(),
				tokenCount: requestData.tokenCount + (responseData?.tokenCount || 0),
				model: requestData.model,
			});

			this.log.debug(`Tracked interaction for session ${sessionId}`);
		} catch (error) {
			this.log.error("Error tracking interaction:", error);
		}
	}

	/**
	 * Get personal analytics for a user
	 */
	public getPersonalAnalytics(
		userId: string,
		timeRangeMs = 24 * 60 * 60 * 1000,
	): PersonalAnalytics {
		const db = this.dbOps.getDatabase();
		const cutoffTime = Date.now() - timeRangeMs;

		try {
			// Get conversation stats
			const conversationStats = db
				.prepare(`
				SELECT 
					COUNT(DISTINCT session_id) as total_conversations,
					COUNT(*) as total_interactions,
					SUM(token_count) as total_tokens,
					AVG(token_count) as avg_tokens_per_interaction,
					SUM(cost_usd) as total_cost
				FROM personal_interactions 
				WHERE user_id = ? AND timestamp > ?
			`)
				.get(userId, cutoffTime) as {
				total_conversations: number;
				total_interactions: number;
				total_tokens: number;
				avg_tokens_per_interaction: number;
				total_cost: number;
			};

			// Get model usage
			const modelUsage = db
				.prepare(`
				SELECT 
					model,
					COUNT(*) as usage_count,
					SUM(token_count) as total_tokens
				FROM personal_interactions 
				WHERE user_id = ? AND timestamp > ?
				GROUP BY model
				ORDER BY usage_count DESC
			`)
				.all(userId, cutoffTime) as Array<{
				model: string;
				usage_count: number;
				total_tokens: number;
			}>;

			// Get conversation patterns (hourly distribution)
			const conversationPatterns = db
				.prepare(`
				SELECT 
					strftime('%H', datetime(timestamp/1000, 'unixepoch')) as hour,
					COUNT(*) as interaction_count
				FROM personal_interactions 
				WHERE user_id = ? AND timestamp > ?
				GROUP BY hour
				ORDER BY hour
			`)
				.all(userId, cutoffTime) as Array<{
				hour: string;
				interaction_count: number;
			}>;

			// Get current quota status
			const quota = this.quotas.get(userId);

			return {
				userId,
				timeRangeMs,
				conversationStats: {
					totalConversations: conversationStats.total_conversations || 0,
					totalInteractions: conversationStats.total_interactions || 0,
					totalTokens: conversationStats.total_tokens || 0,
					avgTokensPerInteraction:
						conversationStats.avg_tokens_per_interaction || 0,
					totalCost: conversationStats.total_cost || 0,
				},
				modelUsage,
				conversationPatterns,
				quotaStatus: quota
					? {
							tokensUsed: quota.tokensUsed,
							tokensLimit: quota.tokensLimit,
							requestsUsed: quota.requestsUsed,
							requestsLimit: quota.requestsLimit,
							resetTime: quota.resetTime,
						}
					: null,
			};
		} catch (error) {
			this.log.error("Error getting personal analytics:", error);
			throw error;
		}
	}

	/**
	 * Get active sessions for a user
	 */
	public getActiveSessions(userId?: string): PersonalSession[] {
		const sessions = Array.from(this.sessions.values());
		return userId ? sessions.filter((s) => s.userId === userId) : sessions;
	}

	/**
	 * Set personal quota for a user
	 */
	public setPersonalQuota(userId: string, quota: Partial<PersonalQuota>): void {
		const existing = this.quotas.get(userId) || {
			userId,
			tokensUsed: 0,
			tokensLimit: 10000,
			requestsUsed: 0,
			requestsLimit: 100,
			resetTime: this.getNextResetTime(),
		};

		this.quotas.set(userId, {
			...existing,
			...quota,
		});

		this.log.info(`Set personal quota for user ${userId}`);
	}

	/**
	 * Check if user has exceeded quota
	 */
	public checkQuotaExceeded(userId: string): boolean {
		const quota = this.quotas.get(userId);
		if (!quota) return false;

		return (
			quota.tokensUsed >= quota.tokensLimit ||
			quota.requestsUsed >= quota.requestsLimit
		);
	}

	/**
	 * Clean up old data and expired sessions
	 */
	public cleanup(): void {
		// Skip cleanup if retention is disabled (-1)
		if (this.config.dataRetentionDays === -1) {
			this.log.info("Data retention disabled - skipping cleanup");
			return;
		}

		const cutoffTime =
			Date.now() - (this.config.dataRetentionDays || 7) * 24 * 60 * 60 * 1000;
		const sessionTimeout =
			Date.now() - (this.config.sessionTimeoutMs || 30 * 60 * 1000);

		try {
			// Clean up old interactions
			const db = this.dbOps.getDatabase();
			const deletedRows = db
				.prepare(`
				DELETE FROM personal_interactions 
				WHERE timestamp < ?
			`)
				.run(cutoffTime);

			this.log.info(
				`Cleaned up ${deletedRows.changes} old personal interactions`,
			);

			// Clean up expired sessions (skip if session timeout is disabled)
			if (this.config.sessionTimeoutMs !== -1) {
				let expiredSessions = 0;
				for (const [sessionId, session] of this.sessions) {
					if (session.lastActivity < sessionTimeout) {
						this.sessions.delete(sessionId);
						expiredSessions++;
					}
				}

				this.log.info(`Cleaned up ${expiredSessions} expired sessions`);
			}

			// Reset quotas if needed
			const now = Date.now();
			for (const [userId, quota] of this.quotas) {
				if (now >= quota.resetTime) {
					quota.tokensUsed = 0;
					quota.requestsUsed = 0;
					quota.resetTime = this.getNextResetTime();
					this.log.info(`Reset quota for user ${userId}`);
				}
			}
		} catch (error) {
			this.log.error("Error during cleanup:", error);
		}
	}

	/**
	 * Initialize database tables for personal mode
	 */
	public initializeTables(): void {
		const db = this.dbOps.getDatabase();

		// Create personal_interactions table
		db.exec(`
			CREATE TABLE IF NOT EXISTS personal_interactions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				timestamp INTEGER NOT NULL,
				model TEXT,
				token_count INTEGER DEFAULT 0,
				cost_usd REAL DEFAULT 0,
				interaction_type TEXT DEFAULT 'message',
				anonymized_content TEXT,
				created_at INTEGER DEFAULT (strftime('%s', 'now'))
			);

			CREATE INDEX IF NOT EXISTS idx_personal_interactions_user_timestamp 
			ON personal_interactions(user_id, timestamp);

			CREATE INDEX IF NOT EXISTS idx_personal_interactions_session 
			ON personal_interactions(session_id, timestamp);
		`);

		this.log.info("Personal mode database tables initialized");
	}

	private updateSession(
		sessionId: string,
		userId: string,
		interaction: PersonalInteraction,
	): void {
		const existing = this.sessions.get(sessionId);
		const now = Date.now();

		if (existing) {
			existing.lastActivity = now;
			existing.interactionCount++;
			existing.totalTokens +=
				interaction.requestData.tokenCount +
				(interaction.responseData?.tokenCount || 0);
		} else {
			this.sessions.set(sessionId, {
				sessionId,
				userId,
				startTime: now,
				lastActivity: now,
				interactionCount: 1,
				totalTokens:
					interaction.requestData.tokenCount +
					(interaction.responseData?.tokenCount || 0),
			});
		}
	}

	private updateQuotaUsage(
		userId: string,
		requestData: PersonalInteraction["requestData"],
		responseData: PersonalInteraction["responseData"],
	): void {
		const quota = this.quotas.get(userId);
		if (!quota) return;

		quota.requestsUsed++;
		quota.tokensUsed +=
			requestData.tokenCount + (responseData?.tokenCount || 0);

		// Emit quota warning if approaching limits
		const tokenUtilization = quota.tokensUsed / quota.tokensLimit;
		const requestUtilization = quota.requestsUsed / quota.requestsLimit;

		if (tokenUtilization > 0.8 || requestUtilization > 0.8) {
			this.emit("quotaWarning", {
				userId,
				tokenUtilization,
				requestUtilization,
			});
		}
	}

	private storeInteraction(interaction: PersonalInteraction): void {
		const db = this.dbOps.getDatabase();

		let anonymizedContent = null;
		if (this.config.enableAnonymization && interaction.requestData.content) {
			// Simple anonymization - in production, use more sophisticated methods
			anonymizedContent = this.anonymizeContent(
				interaction.requestData.content,
			);
		}

		db.prepare(`
			INSERT INTO personal_interactions 
			(session_id, user_id, timestamp, model, token_count, cost_usd, interaction_type, anonymized_content)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			interaction.sessionId,
			interaction.userId,
			Date.now(),
			interaction.requestData.model,
			interaction.requestData.tokenCount +
				(interaction.responseData?.tokenCount || 0),
			interaction.requestData.costUsd || 0,
			interaction.type || "message",
			anonymizedContent,
		);
	}

	private anonymizeContent(content: string): string {
		// Basic anonymization - replace potential PII patterns
		return content
			.replace(
				/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
				"[EMAIL]",
			)
			.replace(/\b\d{3}-\d{3}-\d{4}\b/g, "[PHONE]")
			.replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, "[CARD]");
	}

	private getNextResetTime(): number {
		// Reset daily at midnight UTC
		const tomorrow = new Date();
		tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
		tomorrow.setUTCHours(0, 0, 0, 0);
		return tomorrow.getTime();
	}

	private initializeCleanupTimer(): void {
		// Run cleanup every hour
		setInterval(
			() => {
				this.cleanup();
			},
			60 * 60 * 1000,
		);
	}
}

// Types and interfaces
export interface PersonalModeConfig {
	dataRetentionDays?: number;      // Days to keep data (set to -1 to disable cleanup)
	maxConversationLength?: number;  // Limit content length for privacy
	enableAnonymization?: boolean;   // Enable content anonymization
	personalQuotaEnabled?: boolean;  // Enable quota tracking
	sessionTimeoutMs?: number;       // Session timeout in ms (set to -1 to disable)
}

export interface PersonalInteraction {
	sessionId: string;
	userId: string;
	type?: string;
	requestData: {
		model: string;
		content?: string;
		tokenCount: number;
		costUsd?: number;
	};
	responseData?: {
		content?: string;
		tokenCount: number;
		costUsd?: number;
	};
}
