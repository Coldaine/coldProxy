import { validateNumber } from "@ccflare/core";
import { PersonalModeIntegration } from "@ccflare/personal-mode-monitor";
import {
	createAccountAddHandler,
	createAccountPauseHandler,
	createAccountRemoveHandler,
	createAccountRenameHandler,
	createAccountResumeHandler,
	createAccountsListHandler,
	createAccountTierUpdateHandler,
} from "./handlers/accounts";
import {
	createAgentPreferenceUpdateHandler,
	createAgentsListHandler,
	createBulkAgentPreferenceUpdateHandler,
	createWorkspacesListHandler,
} from "./handlers/agents";
import { createAgentUpdateHandler } from "./handlers/agents-update";
import { createAnalyticsHandler } from "./handlers/analytics";
import { createConfigHandlers } from "./handlers/config";
import { createHealthHandler } from "./handlers/health";
import { createLogsStreamHandler } from "./handlers/logs";
import { createLogsHistoryHandler } from "./handlers/logs-history";
import {
	createCleanupHandler,
	createCompactHandler,
} from "./handlers/maintenance";
import {
	createOAuthCallbackHandler,
	createOAuthInitHandler,
} from "./handlers/oauth";
import {
	createRequestsDetailHandler,
	createRequestsSummaryHandler,
} from "./handlers/requests";
import { createRequestsStreamHandler } from "./handlers/requests-stream";
import { createStatsHandler, createStatsResetHandler } from "./handlers/stats";
import {
	createUnlockPinHandler,
	createWebAuthnChallengeHandler,
	createWebAuthnFinishHandler,
} from "./handlers/unlock";
import { createSetKillSwitchHandler } from "./handlers/admin";
import {
	createDecryptHandler,
	createExportHandler,
	createRotateKeyHandler,
} from "./handlers/decrypt";
import {
	RateLimiter,
	createRateLimitMiddleware,
} from "./middleware/rate-limiter";
import { requireFreshWebAuthn } from "./middleware/auth";
import { createKillSwitchMiddleware } from "./middleware/kill-switch";
import { createRequestIdMiddleware } from "./middleware/request-id";
import type { APIContext } from "./types";
import { errorResponse, HttpError } from "./utils/http-error";

/**
 * API Router that handles all API endpoints
 */
export class APIRouter {
	private context: APIContext;
	private handlers: Map<
		string,
		(req: Request, url: URL) => Response | Promise<Response>
	>;
	private personalModeIntegration: PersonalModeIntegration;
	private unlockRateLimiter: RateLimiter;
	private exportRateLimiter: RateLimiter;

	constructor(context: APIContext) {
		this.context = context;
		this.handlers = new Map();

		// Initialize personal mode integration
		this.personalModeIntegration = new PersonalModeIntegration(
			context.dbOps,
			true,
		);

		this.unlockRateLimiter = new RateLimiter({
			maxRequests: 5,
			windowMs: 60000,
		}); // 5 requests per minute
		this.exportRateLimiter = new RateLimiter({
			maxRequests: 2,
			windowMs: 60000,
		}); // 2 requests per minute

		this.registerHandlers();
	}

	private registerHandlers(): void {
		const { db, config, dbOps } = this.context;

		// Create handlers
		const healthHandler = createHealthHandler(db, config);
		const statsHandler = createStatsHandler(dbOps);
		const statsResetHandler = createStatsResetHandler(dbOps);
		const accountsHandler = createAccountsListHandler(db);
		const accountAddHandler = createAccountAddHandler(dbOps, config);
		const _accountRemoveHandler = createAccountRemoveHandler(dbOps);
		const _accountTierHandler = createAccountTierUpdateHandler(dbOps);
		const requestsSummaryHandler = createRequestsSummaryHandler(db);
		const requestsDetailHandler = createRequestsDetailHandler(dbOps);
		const configHandlers = createConfigHandlers(config);
		const logsStreamHandler = createLogsStreamHandler();
		const logsHistoryHandler = createLogsHistoryHandler();
		const analyticsHandler = createAnalyticsHandler(this.context);
		const oauthInitHandler = createOAuthInitHandler(dbOps);
		const oauthCallbackHandler = createOAuthCallbackHandler(dbOps);
		const agentsHandler = createAgentsListHandler(dbOps);
		const workspacesHandler = createWorkspacesListHandler();
		const requestsStreamHandler = createRequestsStreamHandler();
		const cleanupHandler = createCleanupHandler(dbOps, config);
		const compactHandler = createCompactHandler(dbOps);
		const unlockPinHandler = createUnlockPinHandler(this.context);
		const webauthnChallengeHandler =
			createWebAuthnChallengeHandler(this.context);
		const webauthnFinishHandler = createWebAuthnFinishHandler(this.context);
		const setKillSwitchHandler = createSetKillSwitchHandler(this.context);
		const exportHandler = createExportHandler(this.context);
		const rotateKeyHandler = createRotateKeyHandler(this.context);
		const decryptHandler = createDecryptHandler(this.context);
		const withUnlockRateLimit = createRateLimitMiddleware(
			this.unlockRateLimiter,
		);
		const withExportRateLimit = createRateLimitMiddleware(
			this.exportRateLimiter,
		);
		const withKillSwitch = createKillSwitchMiddleware(this.context);

		// Register routes
		this.handlers.set("GET:/health", () => healthHandler());
		this.handlers.set("GET:/api/stats", () => statsHandler());
		this.handlers.set("POST:/api/stats/reset", () => statsResetHandler());
		this.handlers.set("GET:/api/accounts", () => accountsHandler());
		this.handlers.set("POST:/api/accounts", (req) => accountAddHandler(req));
		this.handlers.set("POST:/api/oauth/init", (req) => oauthInitHandler(req));
		this.handlers.set("POST:/api/oauth/callback", (req) =>
			oauthCallbackHandler(req),
		);
		this.handlers.set("GET:/api/requests", (_req, url) => {
			const limitParam = url.searchParams.get("limit");
			const limit =
				validateNumber(limitParam || "50", "limit", {
					min: 1,
					max: 1000,
					integer: true,
				}) || 50;
			return requestsSummaryHandler(limit);
		});
		this.handlers.set("GET:/api/requests/detail", (_req, url) => {
			const limitParam = url.searchParams.get("limit");
			const limit =
				validateNumber(limitParam || "100", "limit", {
					min: 1,
					max: 1000,
					integer: true,
				}) || 100;
			return requestsDetailHandler(limit);
		});
		this.handlers.set("GET:/api/requests/stream", () =>
			requestsStreamHandler(),
		);
		this.handlers.set("GET:/api/config", () => configHandlers.getConfig());
		this.handlers.set("GET:/api/config/strategy", () =>
			configHandlers.getStrategy(),
		);
		this.handlers.set("POST:/api/config/strategy", (req) =>
			configHandlers.setStrategy(req),
		);
		this.handlers.set("GET:/api/strategies", () =>
			configHandlers.getStrategies(),
		);
		this.handlers.set("GET:/api/config/model", () =>
			configHandlers.getDefaultAgentModel(),
		);
		this.handlers.set("POST:/api/config/model", (req) =>
			configHandlers.setDefaultAgentModel(req),
		);
		this.handlers.set("GET:/api/config/retention", () =>
			configHandlers.getRetention(),
		);
		this.handlers.set("POST:/api/config/retention", (req) =>
			configHandlers.setRetention(req),
		);
		this.handlers.set("POST:/api/maintenance/cleanup", () => cleanupHandler());
		this.handlers.set("POST:/api/maintenance/compact", () => compactHandler());
		this.handlers.set("GET:/api/logs/stream", () => logsStreamHandler());
		this.handlers.set("GET:/api/logs/history", () => logsHistoryHandler());
		this.handlers.set("GET:/api/analytics", (_req, url) => {
			return analyticsHandler(url.searchParams);
		});
		this.handlers.set("GET:/api/agents", () => agentsHandler());
		this.handlers.set("POST:/api/agents/bulk-preference", (req) => {
			const bulkHandler = createBulkAgentPreferenceUpdateHandler(
				this.context.dbOps,
			);
			return bulkHandler(req);
		});
		this.handlers.set("GET:/api/workspaces", () => workspacesHandler());

		// Unlock routes
		this.handlers.set(
			"POST:/unlock/pin",
			withKillSwitch(withUnlockRateLimit((req, url) => unlockPinHandler(req))),
		);
		this.handlers.set(
			"POST:/unlock/webauthn/challenge",
			withKillSwitch(
				withUnlockRateLimit((req, url) => webauthnChallengeHandler(req)),
			),
		);
		this.handlers.set(
			"POST:/unlock/webauthn/finish",
			withKillSwitch(
				withUnlockRateLimit((req, url) => webauthnFinishHandler(req)),
			),
		);

		// Admin routes
		this.handlers.set(
			"POST:/api/admin/kill-switch",
			requireFreshWebAuthn((req, url) => setKillSwitchHandler(req)),
		);

		// Decrypting routes that require fresh WebAuthn
		this.handlers.set(
			"GET:/export",
			withKillSwitch(
				withExportRateLimit(
					requireFreshWebAuthn((req, url) => exportHandler(req)),
				),
			),
		);
		this.handlers.set(
			"POST:/rotate-key",
			withKillSwitch(requireFreshWebAuthn((req, url) => rotateKeyHandler(req))),
		);

		// Other decrypting routes
		this.handlers.set(
			"GET:/decrypt/:id",
			withKillSwitch((req, url) => decryptHandler(req)),
		);

		// Personal mode endpoints
		const personalModeMonitor = this.personalModeIntegration.getMonitor();
		if (personalModeMonitor) {
			const {
				createPersonalModeHandlers,
			} = require("@ccflare/personal-mode-monitor");
			const personalHandlers = createPersonalModeHandlers(personalModeMonitor);

			// Register personal mode routes
			this.handlers.set("GET:/api/personal/sessions", (_req, url) =>
				personalHandlers.getActiveSessions(url.searchParams),
			);
			this.handlers.set("GET:/api/personal/metrics", () =>
				personalHandlers.getPersonalModeMetrics(),
			);
			this.handlers.set("POST:/api/personal/cleanup", () =>
				personalHandlers.triggerCleanup(),
			);
		}
	}

	/**
	 * Wrap a handler with error handling
	 */
	private wrapHandler(
		handler: (req: Request, url: URL) => Response | Promise<Response>,
	): (req: Request, url: URL) => Promise<Response> {
		return async (req: Request, url: URL) => {
			try {
				return await handler(req, url);
			} catch (error) {
				const requestId = req.headers.get("X-Request-ID");
				const routeName = `${req.method} ${url.pathname}`;
				const errorId =
					error instanceof HttpError ? error.errorId : "unknown_error";

				this.context.logger.error(
					`Error in handler for route: ${routeName}`,
					{ error, requestId, errorId },
				);
				return errorResponse(error);
			}
		};
	}

	/**
	 * Handle an incoming request
	 */
	async handleRequest(url: URL, req: Request): Promise<Response | null> {
		const path = url.pathname;
		const method = req.method;
		const key = `${method}:${path}`;

		const withRequestId = createRequestIdMiddleware();

		// Check for exact match
		const handler = this.handlers.get(key);
		if (handler) {
			return await this.wrapHandler(withRequestId(handler))(req, url);
		}

		// Check for dynamic account endpoints
		if (path.startsWith("/api/accounts/")) {
			const parts = path.split("/");
			const accountId = parts[3];

			// Account tier update
			if (path.endsWith("/tier") && method === "POST") {
				const tierHandler = createAccountTierUpdateHandler(this.context.dbOps);
				return await this.wrapHandler((req) => tierHandler(req, accountId))(
					req,
					url,
				);
			}

			// Account pause
			if (path.endsWith("/pause") && method === "POST") {
				const pauseHandler = createAccountPauseHandler(this.context.dbOps);
				return await this.wrapHandler((req) => pauseHandler(req, accountId))(
					req,
					url,
				);
			}

			// Account resume
			if (path.endsWith("/resume") && method === "POST") {
				const resumeHandler = createAccountResumeHandler(this.context.dbOps);
				return await this.wrapHandler((req) => resumeHandler(req, accountId))(
					req,
					url,
				);
			}

			// Account rename
			if (path.endsWith("/rename") && method === "POST") {
				const renameHandler = createAccountRenameHandler(this.context.dbOps);
				return await this.wrapHandler((req) => renameHandler(req, accountId))(
					req,
					url,
				);
			}

			// Account removal
			if (parts.length === 4 && method === "DELETE") {
				const removeHandler = createAccountRemoveHandler(this.context.dbOps);
				return await this.wrapHandler((req) => removeHandler(req, accountId))(
					req,
					url,
				);
			}
		}

		// Check for dynamic agent endpoints
		if (path.startsWith("/api/agents/")) {
			const parts = path.split("/");
			const agentId = parts[3];

			// Agent preference update
			if (path.endsWith("/preference") && method === "POST") {
				const preferenceHandler = createAgentPreferenceUpdateHandler(
					this.context.dbOps,
				);
				return await this.wrapHandler((req) => preferenceHandler(req, agentId))(
					req,
					url,
				);
			}

			// Agent update (PATCH /api/agents/:id)
			if (parts.length === 4 && method === "PATCH") {
				const updateHandler = createAgentUpdateHandler(this.context.dbOps);
				return await this.wrapHandler((req) => updateHandler(req, agentId))(
					req,
					url,
				);
			}
		}

		// Check for dynamic personal mode endpoints
		if (path.startsWith("/api/personal/")) {
			const personalModeMonitor = this.personalModeIntegration.getMonitor();
			if (personalModeMonitor) {
				const {
					createPersonalModeHandlers,
				} = require("@ccflare/personal-mode-monitor");
				const personalHandlers =
					createPersonalModeHandlers(personalModeMonitor);

				const parts = path.split("/");

				// GET /api/personal/analytics/:userId
				if (parts[3] === "analytics" && parts[4] && method === "GET") {
					const userId = parts[4];
					return await this.wrapHandler(() =>
						personalHandlers.getPersonalAnalytics(userId, url.searchParams),
					)(req, url);
				}

				// GET /api/personal/quota/:userId
				if (parts[3] === "quota" && parts[4] && method === "GET") {
					const userId = parts[4];
					return await this.wrapHandler(() =>
						personalHandlers.getQuotaStatus(userId),
					)(req, url);
				}

				// POST /api/personal/quota/:userId
				if (parts[3] === "quota" && parts[4] && method === "POST") {
					const userId = parts[4];
					return await this.wrapHandler((req) =>
						personalHandlers.setPersonalQuota(userId, req),
					)(req, url);
				}
			}
		}

		// No matching route
		return null;
	}

	/**
	 * Get the personal mode integration instance
	 */
	public getPersonalModeIntegration(): PersonalModeIntegration {
		return this.personalModeIntegration;
	}
}
