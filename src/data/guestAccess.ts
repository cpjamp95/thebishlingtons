export type GuestType = "day" | "evening" | "weddingParty" | "admin";

export const guestPasswords: Record<string, GuestType> = {
  "bish-day": "day",
  "bish-evening": "evening",
  "bish-party": "weddingParty",
  "bish-admin": "admin",
};
