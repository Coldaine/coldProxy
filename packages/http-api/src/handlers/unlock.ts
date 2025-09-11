import type { APIContext } from "../types";
import { getSession, saveSession } from "../middleware/session";
import { validateBody } from "../middleware/validation";
import {
	unlockPinSchema,
	webauthnChallengeSchema,
	webauthnFinishSchema,
} from "../validation/schemas";
import { errorResponse, successResponse } from "../utils/http-error";

export function createUnlockPinHandler({ unlockService }: APIContext) {
    return validateBody(unlockPinSchema, async (req, url, body) => {
        try {
            const { userId, pin } = body;
            const success = await unlockService.unlockWithPin(userId, pin);
            if (success) {
                const session = getSession(req);
                session.userId = userId;
                const res = successResponse({ success });
                saveSession(res, session);
                return res;
            }
            return successResponse({ success });
        } catch (error) {
            return errorResponse(error);
        }
    });
}

export function createWebAuthnChallengeHandler({ unlockService }: APIContext) {
    return validateBody(webauthnChallengeSchema, async (req, url, body) => {
        try {
            const { userId } = body;
            const { options, challenge } = await unlockService.generateWebAuthnChallenge(userId);

            const session = getSession(req);
            session.challenge = challenge;
            const res = successResponse({ options });
            saveSession(res, session);

            return res;
        } catch (error) {
            return errorResponse(error);
        }
    });
}

export function createWebAuthnFinishHandler({ unlockService, config }: APIContext) {
    return validateBody(webauthnFinishSchema, async (req, url, body) => {
        try {
            const { userId, assertionResponse } = body;
            const session = getSession(req);
            const challenge = session.challenge;

            const rpID = config.get("webauthn.rpId") as string;
            const rpOrigin = config.get("webauthn.rpOrigin") as string;
            const success = await unlockService.unlockWithWebAuthn(userId, assertionResponse, challenge, rpID, rpOrigin);

            if (success) {
                session.lastUVAt = Date.now();
                session.userId = userId;
            }
            const res = successResponse({ success });
            saveSession(res, session);

            return res;
        } catch (error) {
            return errorResponse(error);
        }
    };
}
