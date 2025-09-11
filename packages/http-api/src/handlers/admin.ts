import type { APIContext } from "../types";
import { successResponse, errorResponse } from "../utils/http-error";
import type { Logger } from "@ccflare/logger";
import { validateBody } from "../middleware/validation";
import { setKillSwitchSchema } from "../validation/schemas";

// We need to extend APIContext to include the logger
interface AdminAPIContext extends APIContext {
    logger: Logger;
}

export function createSetKillSwitchHandler({ config, logger }: AdminAPIContext) {
    return validateBody(setKillSwitchSchema, async (req, url, body) => {
        try {
            const { enabled } = body;
            config.setKillSwitch(enabled);
            logger.info(`Kill switch ${enabled ? 'enabled' : 'disabled'}`);
            return successResponse({ success: true });
        } catch (error) {
            logger.error("Failed to set kill switch", error);
            return errorResponse(error);
        }
    });
}
