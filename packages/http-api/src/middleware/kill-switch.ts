import type { APIContext } from "../types";
import { ServiceUnavailable } from "@ccflare/http-common";

export function createKillSwitchMiddleware({ config }: APIContext) {
    return (handler: (req: Request, url: URL) => Response | Promise<Response>) => {
        return (req: Request, url: URL): Response | Promise<Response> => {
            if (config.getKillSwitch()) {
                // This error should be generic and not reveal the existence of a kill switch
                throw ServiceUnavailable("Service is temporarily unavailable. Please try again later.");
            }
            return handler(req, url);
        };
    };
}
