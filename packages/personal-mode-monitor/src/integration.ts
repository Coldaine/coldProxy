import type { DatabaseOperations } from "@ccflare/database";
import { Logger } from "@ccflare/logger";
import type { ProxyRequest, ProxyResponse } from "@ccflare/proxy";
import {
	type PersonalInteraction,
	PersonalModeLLMMonitor,
} from "./personal_mode_llm_monitor";

/**
 * Integration layer for Personal Mode LLM Monitor with the existing proxy system
 */
export class PersonalModeIntegration {
	private readonly log: Logger;
	private readonly monitor: PersonalModeLLMMonitor | null;
	private readonly enabled: boolean;

	constructor(dbOps: DatabaseOperations, enabled = true) {
		this.log = new Logger("PersonalModeIntegration");
		this.enabled = enabled;

		if (this.enabled) {
			this.monitor = new PersonalModeLLMMonitor(dbOps, {
				dataRetentionDays: 7,
				maxConversationLength: 100,
				enableAnonymization: true,
				personalQuotaEnabled: true,
				sessionTimeoutMs: 30 * 60 * 1000,
			});

			// Initialize database tables
			this.monitor.initializeTables();
			this.log.info("Personal Mode integration enabled");
		} else {
			this.monitor = null;
			this.log.info("Personal Mode integration disabled");
		}
	}

	/**
	 * Extract user ID from request headers or session
	 */
	private extractUserId(request: Request, _sessionId?: string): string {
		// Try to get user ID from headers first
		const userIdHeader =
			request.headers.get("x-user-id") ||
			request.headers.get("x-personal-user-id");

		if (userIdHeader) {
			return userIdHeader;
		}

		// Fallback: generate anonymous user ID from session or IP
		const forwardedFor = request.headers.get("x-forwarded-for");
		const userAgent = request.headers.get("user-agent");
		const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

		// Create a semi-persistent anonymous user ID
		const anonymousId = this.hashString(
			`${ip}-${userAgent?.substring(0, 50) || "unknown"}`,
		);
		return `anon-${anonymousId}`;
	}

	/**
	 * Simple hash function for generating anonymous IDs
	 */
	private hashString(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash).toString(36);
	}

	/**
	 * Extract session ID from request or headers
	 */
	private extractSessionId(request: Request): string {
		// Try session headers
		const sessionHeader =
			request.headers.get("x-session-id") ||
			request.headers.get("x-conversation-id");

		if (sessionHeader) {
			return sessionHeader;
		}

		// Generate session ID from request characteristics
		const timestamp = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute windows
		const userAgent = request.headers.get("user-agent");
		const referer = request.headers.get("referer");

		const sessionData = `${timestamp}-${userAgent?.substring(0, 20) || "unknown"}-${referer || "direct"}`;
		return `session-${this.hashString(sessionData)}`;
	}

	/**
	 * Estimate token count from content (rough approximation)
	 */
	private estimateTokenCount(content: string): number {
		if (!content) return 0;
		// Rough approximation: ~4 characters per token for English text
		return Math.ceil(content.length / 4);
	}

	/**
	 * Extract content from request body
	 */
	private async extractRequestContent(request: Request): Promise<string> {
		try {
			const body = await request.clone().json();

			// Handle different message formats
			if (body.messages && Array.isArray(body.messages)) {
				return body.messages
					.map((msg: { content?: string }) => msg.content || "")
					.join(" ")
					.substring(0, 1000); // Limit for privacy
			}

			if (body.prompt) {
				return String(body.prompt).substring(0, 1000);
			}

			if (body.input) {
				return String(body.input).substring(0, 1000);
			}

			return "";
		} catch {
			return "";
		}
	}

	/**
	 * Hook into proxy request processing
	 */
	public async onProxyRequest(
		request: Request,
		_proxyRequest: ProxyRequest,
	): Promise<void> {
		if (!this.enabled || !this.monitor) return;

		try {
			const userId = this.extractUserId(request);
			const sessionId = this.extractSessionId(request);

			// Check quota before processing
			if (this.monitor.checkQuotaExceeded(userId)) {
				this.log.warn(`Quota exceeded for user ${userId}`);
				// Could throw an error here to block the request
				// throw new Error("Personal quota exceeded");
			}

			// Extract content for monitoring
			const content = await this.extractRequestContent(request);
			const tokenCount = this.estimateTokenCount(content);

			// Store request metadata for later correlation with response
			const requestKey = `${sessionId}-${Date.now()}`;
			this.pendingRequests.set(requestKey, {
				userId,
				sessionId,
				content,
				tokenCount,
				model: "unknown", // ProxyRequest doesn't have model field
				timestamp: Date.now(),
			});

			// Clean up old pending requests (>5 minutes)
			this.cleanupPendingRequests();
		} catch (error) {
			this.log.error("Error in onProxyRequest:", error);
		}
	}

	/**
	 * Hook into proxy response processing
	 */
	public async onProxyResponse(
		request: Request,
		_response: Response,
		proxyResponse: ProxyResponse,
	): Promise<void> {
		if (!this.enabled || !this.monitor) return;

		try {
			const userId = this.extractUserId(request);
			const sessionId = this.extractSessionId(request);

			// Find corresponding request
			const requestKey = Array.from(this.pendingRequests.keys()).find((key) =>
				key.startsWith(sessionId),
			);

			const pendingRequest = requestKey
				? this.pendingRequests.get(requestKey)
				: null;

			if (pendingRequest && requestKey) {
				this.pendingRequests.delete(requestKey);
			}

			// Extract response content if available (ProxyResponse body is stream/string/null)
			let responseContent = "";
			let responseTokenCount = 0;

			if (proxyResponse.body && typeof proxyResponse.body === "string") {
				responseContent = proxyResponse.body.substring(0, 1000);
				responseTokenCount = this.estimateTokenCount(responseContent);
			}

			// Track the interaction
			const interaction: PersonalInteraction = {
				sessionId,
				userId,
				type: "message",
				requestData: {
					model: pendingRequest?.model || "unknown",
					content: pendingRequest?.content || "",
					tokenCount: pendingRequest?.tokenCount || 0,
					costUsd: 0, // Cost calculation would need to be done elsewhere
				},
				responseData: {
					content: responseContent,
					tokenCount: responseTokenCount,
					costUsd: 0, // Cost calculation would need to be done elsewhere
				},
			};

			this.monitor.trackInteraction(interaction);
		} catch (error) {
			this.log.error("Error in onProxyResponse:", error);
		}
	}

	/**
	 * Get the monitor instance
	 */
	public getMonitor(): PersonalModeLLMMonitor | null {
		return this.enabled ? this.monitor : null;
	}

	/**
	 * Check if personal mode is enabled
	 */
	public isEnabled(): boolean {
		return this.enabled;
	}

	// Map to store pending requests for correlation
	private readonly pendingRequests = new Map<
		string,
		{
			userId: string;
			sessionId: string;
			content: string;
			tokenCount: number;
			model: string;
			timestamp: number;
		}
	>();

	/**
	 * Clean up old pending requests
	 */
	private cleanupPendingRequests(): void {
		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

		for (const [key, req] of this.pendingRequests) {
			if (req.timestamp < fiveMinutesAgo) {
				this.pendingRequests.delete(key);
			}
		}
	}
}
