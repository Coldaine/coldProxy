import { Forbidden, Unauthorized } from "@ccflare/http-common";
import { getSession } from "./session";

const FRESH_WEBAUTHN_TTL = 5 * 60 * 1000; // 5 minutes

export function requireFreshWebAuthn(handler: (req: Request, url: URL) => Response | Promise<Response>) {
    return (req: Request, url: URL): Response | Promise<Response> => {
        const session = getSession(req);
        if (!session.lastUVAt || Date.now() - session.lastUVAt > FRESH_WEBAUTHN_TTL) {
            throw Forbidden("Fresh WebAuthn authentication required.");
        }
        return handler(req, url);
    };
}

export function requireAuth(handler: (req: Request, url: URL) => Response | Promise<Response>) {
    return (req: Request, url: URL): Response | Promise<Response> => {
        const session = getSession(req);
        if (!session.userId) {
            throw Unauthorized("Authentication required.");
        }
        return handler(req, url);
    };
}
