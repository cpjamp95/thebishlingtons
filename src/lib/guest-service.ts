import { createClient } from "@supabase/supabase-js";
import { weddingBackend } from "../data/backend";

export type Household = {
  label: string;
  guest_type: "day" | "evening" | "weddingParty";
  guests: { name: string }[];
};
export type GuestHome = Household & { display_name: string };
const url = import.meta.env.PUBLIC_SUPABASE_URL?.trim() || weddingBackend.url;
const key =
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  weddingBackend.publishableKey;
// The fictional preview is available only in the development server, never in a build.
export const preview =
  import.meta.env.DEV && import.meta.env.PUBLIC_ONBOARDING_PREVIEW === "true";
export const supabase =
  !preview && url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
export const configured = preview || Boolean(supabase);
const pendingKey = "bishlingtons.pending-invitation";
const previewKey = "bishlingtons.preview-home";
export const normaliseCode = (value: string) =>
  value.replace(/[\s-]/g, "").toUpperCase();
export function rememberCode(code: string) {
  sessionStorage.setItem(pendingKey, normaliseCode(code));
}
export function forgetCode() {
  sessionStorage.removeItem(pendingKey);
}
export function pendingCode() {
  return sessionStorage.getItem(pendingKey);
}
const fictional: Record<string, Household> = {
  DEMODAY: {
    label: "The Taylor household",
    guest_type: "day",
    guests: [{ name: "Jamie Taylor" }, { name: "Sam Taylor" }],
  },
  DEMOEVENING: {
    label: "The Morgan household",
    guest_type: "evening",
    guests: [{ name: "Robin Morgan" }],
  },
  DEMOPARTY: {
    label: "The Parker household",
    guest_type: "weddingParty",
    guests: [{ name: "Charlie Parker" }],
  },
};
export async function lookupInvitation(code: string): Promise<Household> {
  const normalised = normaliseCode(code);
  if (preview) {
    if (!fictional[normalised])
      throw new Error(
        "That invitation code was not found. Please check your invitation and try again.",
      );
    return fictional[normalised];
  }
  if (!supabase)
    throw new Error(
      "Guest registration is not open yet. Please try again soon.",
    );
  const { data, error } = await supabase.rpc("lookup_invitation", {
    invitation_code: normalised,
  });
  if (error)
    throw new Error(
      error.message.includes("INVITATION_INVALID")
        ? "That invitation code was not found or has expired. Please check your invitation."
        : "We could not check your invitation. Please try again in a moment.",
    );
  return data as Household;
}
export async function loadHome(): Promise<GuestHome | null> {
  if (preview) {
    const saved = localStorage.getItem(previewKey);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(previewKey);
      return null;
    }
  }
  if (!supabase) return null;
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return null;
  const { data, error } = await supabase.rpc("guest_home");
  if (error)
    throw new Error("We could not load your invitation. Please try again.");
  return data as GuestHome | null;
}
export async function claimInvitation(code: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("claim_invitation", {
    invitation_code: normaliseCode(code),
  });
  if (error)
    throw new Error(
      error.message.includes("ALREADY_LINKED")
        ? "This account is already linked to another invitation. Please contact Cameron or Alex."
        : "We could not link your invitation. Check your code and confirm your email before trying again.",
    );
  forgetCode();
}
export function savePreview(household: Household, name: string) {
  localStorage.setItem(
    previewKey,
    JSON.stringify({ ...household, display_name: name }),
  );
  forgetCode();
}
export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("We could not sign you out. Please try again.");
  }
  localStorage.removeItem(previewKey);
  forgetCode();
}
export const returnUrl = () =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;
