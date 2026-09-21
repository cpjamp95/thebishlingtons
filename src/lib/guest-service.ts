import { createClient } from "@supabase/supabase-js";
import { weddingBackend } from "../data/backend";

export type Household = {
  label: string;
  guest_type: "day" | "evening" | "weddingParty";
  guests: { name: string }[];
};
export type GuestHome = Household & { display_name: string };
export type MealGuest = {
  id: string;
  name: string;
  starter: string | null;
  main: string | null;
  dessert: string | null;
  updated_at: string | null;
};
export type MenuChoices = { guests: MealGuest[] };
export type GuestMessage = {
  id: string;
  author_name: string;
  message: string;
  created_at: string;
};
export type HoneymoonSuggestion = {
  id: string;
  author_name: string;
  destination: string;
  story: string;
  photo_path: string | null;
  created_at: string;
};
export type SocialFeed = {
  messages: GuestMessage[];
  suggestions: HoneymoonSuggestion[];
};
export type ProfileGuest = {
  id: string;
  name: string;
  starter: string | null;
  main: string | null;
  dessert: string | null;
  menu_complete: boolean;
};
export type ProfileSummary = {
  display_name: string;
  household_label: string;
  guest_type: "day" | "evening" | "weddingParty";
  guests: ProfileGuest[];
  tasks: {
    meals_complete: boolean;
    meal_guests_remaining: number;
    message_complete: boolean;
    suggestion_complete: boolean;
  };
};
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
const previewMenuKey = "bishlingtons.preview-menu";
const previewSocialKey = "bishlingtons.preview-social";
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
export async function loadMenuChoices(): Promise<MenuChoices> {
  if (preview) {
    const home = await loadHome();
    if (!home) return { guests: [] };
    let saved: Record<
      string,
      Pick<MealGuest, "starter" | "main" | "dessert" | "updated_at">
    > = {};
    try {
      saved = JSON.parse(localStorage.getItem(previewMenuKey) || "{}");
    } catch {
      localStorage.removeItem(previewMenuKey);
    }
    return {
      guests: home.guests.map((guest, index) => {
        const id = "preview-" + index;
        return {
          id,
          name: guest.name,
          starter: saved[id]?.starter ?? null,
          main: saved[id]?.main ?? null,
          dessert: saved[id]?.dessert ?? null,
          updated_at: saved[id]?.updated_at ?? null,
        };
      }),
    };
  }
  if (!supabase) return { guests: [] };
  const { data, error } = await supabase.rpc("menu_choices");
  if (error)
    throw new Error("We could not load your menu choices. Please try again.");
  return (data as MenuChoices) ?? { guests: [] };
}

export async function saveMealChoices(
  guestId: string,
  choices: { starter: string; main: string; dessert: string },
): Promise<MealGuest> {
  if (preview) {
    const menu = await loadMenuChoices();
    const guest = menu.guests.find((item) => item.id === guestId);
    if (!guest) throw new Error("That guest could not be found.");
    const updated: MealGuest = {
      ...guest,
      ...choices,
      updated_at: new Date().toISOString(),
    };
    let saved: Record<string, unknown> = {};
    try {
      saved = JSON.parse(localStorage.getItem(previewMenuKey) || "{}");
    } catch {
      saved = {};
    }
    saved[guestId] = {
      starter: updated.starter,
      main: updated.main,
      dessert: updated.dessert,
      updated_at: updated.updated_at,
    };
    localStorage.setItem(previewMenuKey, JSON.stringify(saved));
    return updated;
  }
  if (!supabase) throw new Error("Menu choices are not available yet.");
  const { data, error } = await supabase.rpc("save_menu_choices", {
    target_guest_id: guestId,
    starter_choice: choices.starter,
    main_choice: choices.main,
    dessert_choice: choices.dessert,
  });
  if (error)
    throw new Error(
      error.message.includes("GUEST_ACCESS_DENIED")
        ? "That guest is not part of this invitation."
        : "We could not save those choices. Please try again.",
    );
  return data as MealGuest;
}

export function honeymoonPhotoUrl(path: string | null) {
  if (!path || !supabase) return "";
  return supabase.storage.from("honeymoon-suggestions").getPublicUrl(path).data.publicUrl;
}

export async function loadSocialFeed(): Promise<SocialFeed> {
  if (preview) {
    try {
      return JSON.parse(localStorage.getItem(previewSocialKey) || '{"messages":[],"suggestions":[]}');
    } catch {
      localStorage.removeItem(previewSocialKey);
      return { messages: [], suggestions: [] };
    }
  }
  if (!supabase) return { messages: [], suggestions: [] };
  const { data, error } = await supabase.rpc("social_feed");
  if (error) throw new Error("We could not load the social page. Please try again.");
  return (data as SocialFeed) ?? { messages: [], suggestions: [] };
}

export async function addGuestMessage(message: string): Promise<GuestMessage> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Please write a message first.");
  if (trimmed.length > 600) throw new Error("Please keep your message under 600 characters.");
  if (preview) {
    const feed = await loadSocialFeed();
    const item: GuestMessage = {
      id: crypto.randomUUID(),
      author_name: "Preview Guest",
      message: trimmed,
      created_at: new Date().toISOString(),
    };
    feed.messages.unshift(item);
    localStorage.setItem(previewSocialKey, JSON.stringify(feed));
    return item;
  }
  if (!supabase) throw new Error("Guest messages are not available yet.");
  const { data, error } = await supabase.rpc("add_guest_message", {
    message_text: trimmed,
  });
  if (error) throw new Error("We could not save your message. Please try again.");
  return data as GuestMessage;
}

export async function uploadHoneymoonPhoto(file: File): Promise<string> {
  if (preview) return "";
  if (!supabase) throw new Error("Photo upload is not available yet.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Please choose an image smaller than 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Please upload a JPG, PNG or WebP image.");
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Please sign in again before uploading.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = userData.user.id + "/" + crypto.randomUUID() + "." + extension;
  const { error } = await supabase.storage
    .from("honeymoon-suggestions")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw new Error("We could not upload that photo. Please try again.");
  return path;
}

export async function addHoneymoonSuggestion(
  destination: string,
  story: string,
  photoPath: string | null,
): Promise<HoneymoonSuggestion> {
  const place = destination.trim();
  const copy = story.trim();
  if (!place) throw new Error("Please add a destination.");
  if (!copy) throw new Error("Tell us what makes it special.");
  if (place.length > 120 || copy.length > 700) throw new Error("Please shorten your suggestion a little.");
  if (preview) {
    const feed = await loadSocialFeed();
    const item: HoneymoonSuggestion = {
      id: crypto.randomUUID(),
      author_name: "Preview Guest",
      destination: place,
      story: copy,
      photo_path: null,
      created_at: new Date().toISOString(),
    };
    feed.suggestions.unshift(item);
    localStorage.setItem(previewSocialKey, JSON.stringify(feed));
    return item;
  }
  if (!supabase) throw new Error("Honeymoon suggestions are not available yet.");
  const { data, error } = await supabase.rpc("add_honeymoon_suggestion", {
    destination_text: place,
    story_text: copy,
    photo_path_text: photoPath,
  });
  if (error) throw new Error("We could not save your suggestion. Please try again.");
  return data as HoneymoonSuggestion;
}

export async function loadProfileSummary(): Promise<ProfileSummary> {
  if (preview) {
    const [home, menu, social] = await Promise.all([
      loadHome(),
      loadMenuChoices(),
      loadSocialFeed(),
    ]);
    if (!home) throw new Error("We could not load your profile.");
    const guests: ProfileGuest[] = menu.guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      starter: guest.starter,
      main: guest.main,
      dessert: guest.dessert,
      menu_complete: Boolean(guest.starter && guest.main && guest.dessert),
    }));
    return {
      display_name: home.display_name,
      household_label: home.label,
      guest_type: home.guest_type,
      guests,
      tasks: {
        meals_complete: guests.every((guest) => guest.menu_complete),
        meal_guests_remaining: guests.filter((guest) => !guest.menu_complete).length,
        message_complete: social.messages.length > 0,
        suggestion_complete: social.suggestions.length > 0,
      },
    };
  }
  if (!supabase) throw new Error("Your profile is not available yet.");
  const { data, error } = await supabase.rpc("profile_summary");
  if (error) throw new Error("We could not load your profile. Please try again.");
  return data as ProfileSummary;
}

export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("We could not sign you out. Please try again.");
  }
  localStorage.removeItem(previewKey);
  localStorage.removeItem(previewMenuKey);
  localStorage.removeItem(previewSocialKey);
  forgetCode();
}
export const returnUrl = () =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;
