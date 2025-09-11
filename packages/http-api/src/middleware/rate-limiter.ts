import { TooManyRequests } from "@ccflare/http-common";

interface RateLimitInfo {
    count: number;
    startTime: number;
}

export class RateLimiter {
    private store = new Map<string, RateLimitInfo>();
    private maxRequests: number;
    private windowMs: number;

    constructor(options: { maxRequests: number; windowMs: number }) {
        this.maxRequests = options.maxRequests;
        this.windowMs = options.windowMs;
    }

    limit(key: string): boolean {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        const info = this.store.get(key) || { count: 0, startTime: now };

        if (info.startTime < windowStart) {
            // Reset window
            info.count = 0;
            info.startTime = now;
        }

        info.count++;
        this.store.set(key, info);

        return info.count > this.maxRequests;
    }
}

export function createRateLimitMiddleware(rateLimiter: RateLimiter) {
    return (handler: (req: Request, url: URL) => Response | Promise<Response>) => {
        return (req: Request, url: URL): Response | Promise<Response> => {
            // Use IP address as the key for rate limiting
            const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
            if (rateLimiter.limit(ip)) {
                throw TooManyRequests("Too many requests, please try again later.");
            }
            return handler(req, url);
        };
    };
}
