import { z } from "zod";

export const unlockPinSchema = z.object({
    userId: z.string(),
    pin: z.string(),
});

export const webauthnChallengeSchema = z.object({
    userId: z.string(),
});

export const webauthnFinishSchema = z.object({
    userId: z.string(),
    assertionResponse: z.any(),
});

export const setKillSwitchSchema = z.object({
    enabled: z.boolean(),
});
