import { BadRequest, errorResponse, jsonResponse } from "@ccflare/http-common";
import { Logger } from "@ccflare/logger";
import type { PersonalModeLLMMonitor } from "./personal_mode_llm_monitor";
import type { PersonalModeMetrics } from "./types";

const log = new Logger("PersonalModeHandlers");

/**
 * Create HTTP handlers for personal mode endpoints
 */
export function createPersonalModeHandlers(monitor: PersonalModeLLMMonitor) {
	return {
		/**
		 * GET /api/personal/analytics/:userId
		 * Get personal analytics for a specific user
		 */
		getPersonalAnalytics: (userId: string, params: URLSearchParams) => {
			try {
				if (!userId) {
					return errorResponse(BadRequest("User ID is required"));
				}

				const timeRange = params.get("timeRange");
				const timeRangeMs = timeRange
					? parseInt(timeRange)
					: 24 * 60 * 60 * 1000; // Default 24 hours

				if (Number.isNaN(timeRangeMs) || timeRangeMs <= 0) {
					return errorResponse(BadRequest("Invalid time range"));
				}

				const analytics = monitor.getPersonalAnalytics(userId, timeRangeMs);
				return jsonResponse(analytics);
			} catch (error) {
				log.error("Error getting personal analytics:", error);
				return errorResponse(new Error("Failed to get personal analytics"));
			}
		},

		/**
		 * GET /api/personal/sessions
		 * Get active sessions, optionally filtered by user
		 */
		getActiveSessions: (params: URLSearchParams) => {
			try {
				const userId = params.get("userId") || undefined;
				const sessions = monitor.getActiveSessions(userId);
				return jsonResponse({ sessions });
			} catch (error) {
				log.error("Error getting active sessions:", error);
				return errorResponse(new Error("Failed to get active sessions"));
			}
		},

		/**
		 * POST /api/personal/quota/:userId
		 * Set personal quota for a user
		 */
		setPersonalQuota: async (userId: string, request: Request) => {
			try {
				if (!userId) {
					return errorResponse(BadRequest("User ID is required"));
				}

				const body = await request.json();
				const { tokensLimit, requestsLimit } = body;

				if (
					tokensLimit !== undefined &&
					(typeof tokensLimit !== "number" || tokensLimit < 0)
				) {
					return errorResponse(BadRequest("Invalid tokens limit"));
				}

				if (
					requestsLimit !== undefined &&
					(typeof requestsLimit !== "number" || requestsLimit < 0)
				) {
					return errorResponse(BadRequest("Invalid requests limit"));
				}

				monitor.setPersonalQuota(userId, {
					tokensLimit,
					requestsLimit,
				});

				return jsonResponse({
					success: true,
					message: `Personal quota updated for user ${userId}`,
				});
			} catch (error) {
				log.error("Error setting personal quota:", error);
				return errorResponse(new Error("Failed to set personal quota"));
			}
		},

		/**
		 * GET /api/personal/quota/:userId
		 * Check quota status for a user
		 */
		getQuotaStatus: (userId: string) => {
			try {
				if (!userId) {
					return errorResponse(BadRequest("User ID is required"));
				}

				const analytics = monitor.getPersonalAnalytics(
					userId,
					24 * 60 * 60 * 1000,
				);
				const isExceeded = monitor.checkQuotaExceeded(userId);

				return jsonResponse({
					userId,
					quotaStatus: analytics.quotaStatus,
					isExceeded,
				});
			} catch (error) {
				log.error("Error getting quota status:", error);
				return errorResponse(new Error("Failed to get quota status"));
			}
		},

		/**
		 * GET /api/personal/metrics
		 * Get overall personal mode metrics
		 */
		getPersonalModeMetrics: () => {
			try {
				const activeSessions = monitor.getActiveSessions();
				const activeUsers = new Set(activeSessions.map((s) => s.userId)).size;

				// Calculate metrics from active sessions
				const avgSessionLength =
					activeSessions.length > 0
						? activeSessions.reduce(
								(sum, s) => sum + (Date.now() - s.startTime),
								0,
							) / activeSessions.length
						: 0;

				const dailyInteractions = activeSessions.reduce(
					(sum, s) => sum + s.interactionCount,
					0,
				);

				const metrics: PersonalModeMetrics = {
					activeUsers,
					activeSessions: activeSessions.length,
					dailyInteractions,
					avgSessionLength,
					topModels: [], // Would need database query for this
				};

				return jsonResponse(metrics);
			} catch (error) {
				log.error("Error getting personal mode metrics:", error);
				return errorResponse(new Error("Failed to get personal mode metrics"));
			}
		},

		/**
		 * POST /api/personal/cleanup
		 * Trigger manual cleanup of old data
		 */
		triggerCleanup: () => {
			try {
				monitor.cleanup();
				return jsonResponse({
					success: true,
					message: "Cleanup completed successfully",
				});
			} catch (error) {
				log.error("Error during manual cleanup:", error);
				return errorResponse(new Error("Failed to trigger cleanup"));
			}
		},
	};
}
