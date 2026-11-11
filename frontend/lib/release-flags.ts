// Public build flags describe available UI flows; the API enforces access independently.
export const PUBLIC_REGISTRATION_ENABLED = process.env.NEXT_PUBLIC_REGISTRATION_ENABLED === "true";
export const PUBLIC_EMAIL_ENABLED = process.env.NEXT_PUBLIC_EMAIL_ENABLED === "true";
