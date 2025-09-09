import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import type { DatabaseOperations } from "@ccflare/database";
import {
	type PersonalInteraction,
	PersonalModeLLMMonitor,
} from "../src/personal_mode_llm_monitor";

describe("PersonalModeLLMMonitor", () => {
	let db: Database;
	let dbOps: DatabaseOperations;
	let monitor: PersonalModeLLMMonitor;

	beforeEach(() => {
		// Create in-memory database for testing
		db = new Database(":memory:");
		dbOps = {
			getDatabase: () => db,
		} as DatabaseOperations;

		monitor = new PersonalModeLLMMonitor(dbOps, {
			dataRetentionDays: 1,
			enableAnonymization: false,
			personalQuotaEnabled: true,
			sessionTimeoutMs: 5000, // 5 seconds for testing
		});

		// Initialize database tables
		monitor.initializeTables();
	});

	test("should track personal interactions", () => {
		const interaction: PersonalInteraction = {
			sessionId: "test-session-1",
			userId: "user-123",
			type: "message",
			requestData: {
				model: "claude-3-sonnet",
				content: "Hello, how are you?",
				tokenCount: 20,
				costUsd: 0.001,
			},
			responseData: {
				content: "I'm doing well, thank you!",
				tokenCount: 15,
				costUsd: 0.0015,
			},
		};

		monitor.trackInteraction(interaction);

		// Verify the interaction was tracked
		const sessions = monitor.getActiveSessions("user-123");
		expect(sessions).toHaveLength(1);
		expect(sessions[0].sessionId).toBe("test-session-1");
		expect(sessions[0].interactionCount).toBe(1);
		expect(sessions[0].totalTokens).toBe(35); // 20 + 15
	});

	test("should set and check personal quotas", () => {
		const userId = "user-456";

		// Set quota
		monitor.setPersonalQuota(userId, {
			tokensLimit: 100,
			requestsLimit: 10,
		});

		// Should not be exceeded initially
		expect(monitor.checkQuotaExceeded(userId)).toBe(false);

		// Track interactions to approach quota (5 requests * 19 tokens = 95 tokens)
		for (let i = 0; i < 5; i++) {
			monitor.trackInteraction({
				sessionId: `session-${i}`,
				userId,
				requestData: {
					model: "claude-3-sonnet",
					tokenCount: 15,
				},
				responseData: {
					tokenCount: 4, // Changed from 5 to 4 to get 19 tokens per request
				},
			});
		}

		// Should still not be exceeded (5 requests < 10 limit, 95 tokens < 100 limit)
		expect(monitor.checkQuotaExceeded(userId)).toBe(false);

		// Add one more interaction to exceed
		monitor.trackInteraction({
			sessionId: "session-6",
			userId,
			requestData: {
				model: "claude-3-sonnet",
				tokenCount: 10,
			},
			responseData: {
				tokenCount: 1,
			},
		});

		// Should now be exceeded (106 tokens > 100 limit)
		expect(monitor.checkQuotaExceeded(userId)).toBe(true);
	});

	test("should get personal analytics", () => {
		const userId = "user-789";

		// Track some interactions
		monitor.trackInteraction({
			sessionId: "session-a",
			userId,
			requestData: {
				model: "claude-3-sonnet",
				tokenCount: 30,
				costUsd: 0.002,
			},
			responseData: {
				tokenCount: 20,
				costUsd: 0.003,
			},
		});

		monitor.trackInteraction({
			sessionId: "session-b",
			userId,
			requestData: {
				model: "claude-3-haiku",
				tokenCount: 15,
				costUsd: 0.001,
			},
			responseData: {
				tokenCount: 10,
				costUsd: 0.001,
			},
		});

		const analytics = monitor.getPersonalAnalytics(userId);

		expect(analytics.userId).toBe(userId);
		expect(analytics.conversationStats.totalConversations).toBe(2);
		expect(analytics.conversationStats.totalInteractions).toBe(2);
		expect(analytics.conversationStats.totalTokens).toBe(75); // 30+20 + 15+10
		expect(analytics.modelUsage).toHaveLength(2);
		expect(
			analytics.modelUsage.some((m) => m.model === "claude-3-sonnet"),
		).toBe(true);
		expect(analytics.modelUsage.some((m) => m.model === "claude-3-haiku")).toBe(
			true,
		);
	});

	test("should handle session management", () => {
		const userId = "user-session-test";

		// Create multiple sessions
		monitor.trackInteraction({
			sessionId: "session-1",
			userId,
			requestData: { model: "claude-3-sonnet", tokenCount: 10 },
		});

		monitor.trackInteraction({
			sessionId: "session-2",
			userId,
			requestData: { model: "claude-3-sonnet", tokenCount: 15 },
		});

		monitor.trackInteraction({
			sessionId: "session-1", // Same session as first
			userId,
			requestData: { model: "claude-3-sonnet", tokenCount: 5 },
		});

		const sessions = monitor.getActiveSessions(userId);
		expect(sessions).toHaveLength(2);

		const session1 = sessions.find((s) => s.sessionId === "session-1");
		const session2 = sessions.find((s) => s.sessionId === "session-2");

		expect(session1?.interactionCount).toBe(2);
		expect(session2?.interactionCount).toBe(1);
		expect(session1?.totalTokens).toBe(15); // 10 + 5
		expect(session2?.totalTokens).toBe(15);
	});
});
