import type { APIContext } from "../types";
import { successResponse } from "../utils/http-error";

export function createExportHandler({ }: APIContext) {
    return async (req: Request) => {
        return successResponse({ message: "Exported" });
    };
}

export function createRotateKeyHandler({ }: APIContext) {
    return async (req: Request) => {
        return successResponse({ message: "Key rotated" });
    };
}

export function createDecryptHandler({ }: APIContext) {
    return async (req: Request) => {
        return successResponse({ message: "Decrypted" });
    };
}
