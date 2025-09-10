/**
 * Types for Personal Mode LLM Monitor
 */

export interface PersonalSession {
	sessionId: string;
	userId: string;
	startTime: number;
	lastActivity: number;
	interactionCount: number;
	totalTokens: number;
}

export interface PersonalQuota {
	userId: string;
	tokensUsed: number;
	tokensLimit: number;
	requestsUsed: number;
	requestsLimit: number;
	resetTime: number;
}

export interface PersonalAnalytics {
	userId: string;
	timeRangeMs: number;
	conversationStats: {
		totalConversations: number;
		totalInteractions: number;
		totalTokens: number;
		avgTokensPerInteraction: number;
		totalCost: number;
	};
	modelUsage: Array<{
		model: string;
		usage_count: number;
		total_tokens: number;
	}>;
	conversationPatterns: Array<{
		hour: string;
		interaction_count: number;
	}>;
	quotaStatus: {
		tokensUsed: number;
		tokensLimit: number;
		requestsUsed: number;
		requestsLimit: number;
		resetTime: number;
	} | null;
}

export interface PersonalModeEvent {
	type: "interaction" | "quotaWarning" | "sessionStart" | "sessionEnd";
	payload: Record<string, unknown>;
	timestamp: number;
}

export interface PersonalModeMetrics {
	activeUsers: number;
	activeSessions: number;
	dailyInteractions: number;
	avgSessionLength: number;
	topModels: Array<{
		model: string;
		usage: number;
	}>;
}
