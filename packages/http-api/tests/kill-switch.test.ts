import { createKillSwitchMiddleware } from "../src/middleware/kill-switch";
import { Config } from "@ccflare/config";
import { expect, test, describe, mock } from "bun:test";
import { ServiceUnavailable } from "@ccflare/http-common";

describe("KillSwitchMiddleware", () => {
    test("should allow request when kill switch is off", async () => {
        const config = new Config();
        config.setKillSwitch(false);
        const handler = mock(() => new Response("OK"));
        const middleware = createKillSwitchMiddleware({ config } as any);
        const wrapped = middleware(handler);
        const req = new Request("http://localhost");
        const res = await wrapped(req, new URL(req.url));
        expect(res.status).toBe(200);
        expect(handler).toHaveBeenCalled();
    });

    test("should block request when kill switch is on", async () => {
        const config = new Config();
        config.setKillSwitch(true);
        const handler = mock(() => new Response("OK"));
        const middleware = createKillSwitchMiddleware({ config } as any);
        const wrapped = middleware(handler);
        const req = new Request("http://localhost");
        expect(() => wrapped(req, new URL(req.url))).toThrow(ServiceUnavailable);
        expect(handler).not.toHaveBeenCalled();
    });
});
