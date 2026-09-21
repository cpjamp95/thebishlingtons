import { createClient } from "@supabase/supabase-js";
import { weddingBackend } from "../data/backend";

export type Household = {
  label: string;
  guest_type: "day" | "evening" | "weddingParty";
  guests: { name: string }[];
};
export type GuestHome = Household & { display_name: string };
export type AttendanceStatus = "attending" | "declined" | null;
export type RsvpGuest = {
  id: string;
  name: string;
  attendance_status: AttendanceStatus;
  dietary_requirements: string | null;
  allergies: string | null;
  updated_at: string | null;
};
export type RsvpDetails = { guests: RsvpGuest[] };
export type MealGuest = {
  id: string;
  name: string;
  attendance_status: AttendanceStatus;
  starter: string | null;
  main: string | null;
  dessert: string | null;
  updated_at: string | null;
};
export type MenuChoices = { menu_version: number; guests: MealGuest[] };
export type GuestMessage = {
  id: string;
  author_name: string;
  message: string;
  created_at: string;
  is_owner: boolean;
};
export type HoneymoonSuggestion = {
  id: string;
  author_name: string;
  destination: string;
  story: string;
  photo_path: string | null;
  created_at: string;
  is_owner: boolean;
};
export type SocialFeed = {
  messages: GuestMessage[];
  suggestions: HoneymoonSuggestion[];
};
export type ProfileGuest = {
  id: string;
  name: string;
  attendance_status: AttendanceStatus;
  dietary_requirements: string | null;
  allergies: string | null;
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
    rsvp_complete: boolean;
    rsvp_guests_remaining: number;
    meals_complete: boolean;
    meal_guests_remaining: number;
    message_complete: boolean;
    suggestion_complete: boolean;
  };
};
export type AdminHousehold = {
  id: string;
  label: string;
  guest_type: "day" | "evening" | "weddingParty";
  guests: ProfileGuest[];
};
export type AdminDashboard = {
  households: AdminHousehold[];
  messages: Omit<GuestMessage, "is_owner">[];
  suggestions: Omit<HoneymoonSuggestion, "is_owner">[];
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
const previewRsvpKey = "bishlingtons.preview-rsvp";
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

export async function loadRsvpDetails(): Promise<RsvpDetails> {
  if (preview) {
    const home = await loadHome();
    if (!home) return { guests: [] };
    let saved: Record<string, Omit<RsvpGuest, "id" | "name">> = {};
    try {
      saved = JSON.parse(localStorage.getItem(previewRsvpKey) || "{}");
    } catch {
      localStorage.removeItem(previewRsvpKey);
    }
    return {
      guests: home.guests.map((guest, index) => {
        const id = "preview-" + index;
        return {
          id,
          name: guest.name,
          attendance_status: saved[id]?.attendance_status ?? null,
          dietary_requirements: saved[id]?.dietary_requirements ?? null,
          allergies: saved[id]?.allergies ?? null,
          updated_at: saved[id]?.updated_at ?? null,
        };
      }),
    };
  }
  if (!supabase) return { guests: [] };
  const { data, error } = await supabase.rpc("rsvp_details");
  if (error)
    throw new Error("We could not load your RSVP details. Please try again.");
  return (data as RsvpDetails) ?? { guests: [] };
}

export async function saveGuestRsvp(
  guestId: string,
  attendance: Exclude<AttendanceStatus, null>,
  dietary: string,
  allergies: string,
): Promise<RsvpGuest> {
  if (preview) {
    const details = await loadRsvpDetails();
    const guest = details.guests.find((item) => item.id === guestId);
    if (!guest) throw new Error("That guest could not be found.");
    const updated: RsvpGuest = {
      ...guest,
      attendance_status: attendance,
      dietary_requirements:
        attendance === "attending" ? dietary.trim() || null : null,
      allergies: attendance === "attending" ? allergies.trim() || null : null,
      updated_at: new Date().toISOString(),
    };
    let saved: Record<string, unknown> = {};
    try {
      saved = JSON.parse(localStorage.getItem(previewRsvpKey) || "{}");
    } catch {
      saved = {};
    }
    saved[guestId] = {
      attendance_status: updated.attendance_status,
      dietary_requirements: updated.dietary_requirements,
      allergies: updated.allergies,
      updated_at: updated.updated_at,
    };
    localStorage.setItem(previewRsvpKey, JSON.stringify(saved));
    return updated;
  }
  if (!supabase) throw new Error("RSVPs are not available yet.");
  const { data, error } = await supabase.rpc("save_guest_rsvp", {
    target_guest_id: guestId,
    attendance,
    dietary_text: dietary.trim() || null,
    allergies_text: allergies.trim() || null,
  });
  if (error)
    throw new Error(
      error.message.includes("GUEST_ACCESS_DENIED")
        ? "That guest is not part of this invitation."
        : "We could not save that RSVP. Please try again.",
    );
  return data as RsvpGuest;
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
    const rsvp = await loadRsvpDetails();
    return {
      menu_version: 1,
      guests: home.guests.map((guest, index) => {
        const id = "preview-" + index;
        return {
          id,
          name: guest.name,
          attendance_status:
            rsvp.guests.find((item) => item.id === id)?.attendance_status ?? null,
          starter: saved[id]?.starter ?? null,
          main: saved[id]?.main ?? null,
          dessert: saved[id]?.dessert ?? null,
          updated_at: saved[id]?.updated_at ?? null,
        };
      }),
    };
  }
  if (!supabase) return { menu_version: 1, guests: [] };
  const { data, error } = await supabase.rpc("menu_choices");
  if (error)
    throw new Error("We could not load your menu choices. Please try again.");
  return (data as MenuChoices) ?? { menu_version: 1, guests: [] };
}

export async function saveMealChoices(
  guestId: string,
  choices: { starter: string; main: string; dessert: string },
): Promise<MealGuest> {
  if (preview) {
    const menu = await loadMenuChoices();
    const guest = menu.guests.find((item) => item.id === guestId);
    if (!guest) throw new Error("That guest could not be found.");
    if (guest.attendance_status !== "attending")
      throw new Error("Complete this guest’s RSVP before choosing food.");
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
        : error.message.includes("GUEST_NOT_ATTENDING")
          ? "Complete this guest’s RSVP before choosing food."
          : "We could not save those choices. Please try again.",
    );
  return data as MealGuest;
}

export async function honeymoonPhotoUrl(path: string | null) {
  if (!path || !supabase) return "";
  const { data, error } = await supabase.storage
    .from("honeymoon-suggestions")
    .createSignedUrl(path, 3600);
  return error ? "" : data.signedUrl;
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
      is_owner: true,
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

async function prepareHoneymoonPhoto(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Please upload a JPG, PNG or WebP image.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Please choose an image smaller than 12 MB.");

  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("We could not prepare that photo.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.84),
  );
  if (!blob) throw new Error("We could not prepare that photo.");
  if (blob.size > 5 * 1024 * 1024)
    throw new Error("That photo is still too large after optimisation.");
  return blob;
}

export async function uploadHoneymoonPhoto(file: File): Promise<string> {
  if (preview) return "";
  if (!supabase) throw new Error("Photo upload is not available yet.");
  const prepared = await prepareHoneymoonPhoto(file);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user)
    throw new Error("Please sign in again before uploading.");
  const path = userData.user.id + "/" + crypto.randomUUID() + ".jpg";
  const { error } = await supabase.storage
    .from("honeymoon-suggestions")
    .upload(path, prepared, {
      cacheControl: "3600",
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) throw new Error("We could not upload that photo. Please try again.");
  return path;
}

export async function deleteHoneymoonPhoto(path: string | null) {
  if (!path || preview || !supabase) return;
  await supabase.storage.from("honeymoon-suggestions").remove([path]);
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
      is_owner: true,
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
    const rsvp = await loadRsvpDetails();
    const guests: ProfileGuest[] = menu.guests.map((guest) => {
      const response = rsvp.guests.find((item) => item.id === guest.id);
      return {
        id: guest.id,
        name: guest.name,
        attendance_status: response?.attendance_status ?? null,
        dietary_requirements: response?.dietary_requirements ?? null,
        allergies: response?.allergies ?? null,
        starter: guest.starter,
        main: guest.main,
        dessert: guest.dessert,
        menu_complete:
          response?.attendance_status === "attending" &&
          Boolean(guest.starter && guest.main && guest.dessert),
      };
    });
    return {
      display_name: home.display_name,
      household_label: home.label,
      guest_type: home.guest_type,
      guests,
      tasks: {
        rsvp_complete: guests.every(
          (guest) => guest.attendance_status !== null,
        ),
        rsvp_guests_remaining: guests.filter(
          (guest) => guest.attendance_status === null,
        ).length,
        meals_complete:
          guests.every((guest) => guest.attendance_status !== null) &&
          guests
            .filter((guest) => guest.attendance_status === "attending")
            .every((guest) => guest.menu_complete),
        meal_guests_remaining: guests.filter(
          (guest) =>
            guest.attendance_status === "attending" && !guest.menu_complete,
        ).length,
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


export async function updateGuestMessage(
  id: string,
  message: string,
): Promise<GuestMessage> {
  if (preview) {
    const feed = await loadSocialFeed();
    const item = feed.messages.find((entry) => entry.id === id);
    if (!item) throw new Error("That message could not be found.");
    item.message = message.trim();
    localStorage.setItem(previewSocialKey, JSON.stringify(feed));
    return item;
  }
  if (!supabase) throw new Error("Guest messages are not available yet.");
  const { data, error } = await supabase.rpc("update_guest_message", {
    target_message_id: id,
    message_text: message.trim(),
  });
  if (error) throw new Error("We could not update your message.");
  return data as GuestMessage;
}

export async function deleteGuestMessage(id: string) {
  if (preview) {
    const feed = await loadSocialFeed();
    feed.messages = feed.messages.filter((item) => item.id !== id);
    localStorage.setItem(previewSocialKey, JSON.stringify(feed));
    return;
  }
  if (!supabase) return;
  const { error } = await supabase.rpc("delete_guest_message", {
    target_message_id: id,
  });
  if (error) throw new Error("We could not delete your message.");
}

export async function updateHoneymoonSuggestion(
  id: string,
  destination: string,
  story: string,
): Promise<HoneymoonSuggestion> {
  if (preview) {
    const feed = await loadSocialFeed();
    const item = feed.suggestions.find((entry) => entry.id === id);
    if (!item) throw new Error("That suggestion could not be found.");
    item.destination = destination.trim();
    item.story = story.trim();
    localStorage.setItem(previewSocialKey, JSON.stringify(feed));
    return item;
  }
  if (!supabase) throw new Error("Honeymoon suggestions are not available yet.");
  const { data, error } = await supabase.rpc("update_honeymoon_suggestion", {
    target_suggestion_id: id,
    destination_text: destination.trim(),
    story_text: story.trim(),
  });
  if (error) throw new Error("We could not update your suggestion.");
  return data as HoneymoonSuggestion;
}

export async function deleteHoneymoonSuggestion(id: string) {
  if (preview) {
    const feed = await loadSocialFeed();
    feed.suggestions = feed.suggestions.filter((item) => item.id !== id);
    localStorage.setItem(previewSocialKey, JSON.stringify(feed));
    return;
  }
  if (!supabase) return;
  const { data, error } = await supabase.rpc("delete_honeymoon_suggestion", {
    target_suggestion_id: id,
  });
  if (error) throw new Error("We could not delete your suggestion.");
  await deleteHoneymoonPhoto(
    (data as { photo_path?: string | null })?.photo_path ?? null,
  );
}

export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("We could not sign you out. Please try again.");
  }
  localStorage.removeItem(previewKey);
  localStorage.removeItem(previewMenuKey);
  localStorage.removeItem(previewRsvpKey);
  localStorage.removeItem(previewSocialKey);
  forgetCode();
}
export const returnUrl = () =>
  new URL(import.meta.env.BASE_URL, window.location.origin).href;
