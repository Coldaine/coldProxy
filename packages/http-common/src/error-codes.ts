export const ERROR_CODES = {
    // General
    INTERNAL_SERVER_ERROR: "internal_server_error",
    INVALID_REQUEST: "invalid_request",
    UNAUTHORIZED: "unauthorized",
    FORBIDDEN: "forbidden",
    NOT_FOUND: "not_found",
    TOO_MANY_REQUESTS: "too_many_requests",

    // Unlock
    ACCOUNT_LOCKED: "account_locked",
    INVALID_PIN: "invalid_pin",
    INVALID_WEBAUTHN: "invalid_webauthn",

    // Kill Switch
    SERVICE_UNAVAILABLE: "service_unavailable",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
