import { randomUUID } from "crypto";

const sessions = new Map<string, any>();

export function getSession(req: Request): any {
    const sessionId = getSessionId(req);
    if (sessionId && sessions.has(sessionId)) {
        return sessions.get(sessionId);
    }
    return {};
}

export function saveSession(res: Response, session: any): string {
    const sessionId = randomUUID();
    sessions.set(sessionId, session);
    res.headers.set("Set-Cookie", `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Lax`);
    return sessionId;
}

function getSessionId(req: Request): string | null {
    const cookie = req.headers.get("Cookie");
    if (cookie) {
        const match = cookie.match(/session_id=([^;]+)/);
        if (match) {
            return match[1];
        }
    }
    return null;
}
