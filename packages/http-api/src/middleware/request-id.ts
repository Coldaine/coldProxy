import { randomUUID } from "crypto";

export function createRequestIdMiddleware() {
    return (handler: (req: Request, url: URL) => Response | Promise<Response>) => {
        return (req: Request, url: URL): Response | Promise<Response> => {
            if (!req.headers.has("X-Request-ID")) {
                req.headers.set("X-Request-ID", randomUUID());
            }
            return handler(req, url);
        };
    };
}
