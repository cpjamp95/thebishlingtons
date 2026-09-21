import { hydrateMenu } from "./menu";
import { hydrateSocial } from "./social";
import {
  configured,
  preview,
  supabase,
  lookupInvitation,
  loadHome,
  claimInvitation,
  rememberCode,
  forgetCode,
  pendingCode,
  savePreview,
  signOut,
  returnUrl,
  type Household,
  type GuestHome,
} from "../lib/guest-service";

const get = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const card = get(".invitation-flip");
const front = get(".invitation-card--front");
const back = get(".invitation-card--back");
const hero = get(".home-hero");
const home = get("[data-guest-home]");
const feedback = get("[data-feedback]");
let household: Household | null = null;
let currentHome: GuestHome | null = null;
let busy = false;
let recovering =
  new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";
const types = {
  day: "Join us for the full wedding day",
  evening: "Join us for the evening celebration",
  weddingParty: "You’re part of our wedding party",
};
const homeTypes = {
  day: "Day guest",
  evening: "Evening guest",
  weddingParty: "Wedding party",
};

function message(text: string, success = false) {
  feedback.textContent = text;
  feedback.hidden = !text;
  feedback.dataset.tone = success ? "success" : "error";
}
function showPanel(name: string, focus = true) {
  delete document.documentElement.dataset.guestView;
  window.scrollTo({ top: 0, behavior: "instant" });
  if (preview && ["signin", "reset"].includes(name)) name = "code";
  hero.hidden = false;
  home.hidden = true;
  card.classList.add("is-flipped");
  front.inert = true;
  front.setAttribute("aria-hidden", "true");
  back.inert = false;
  back.setAttribute("aria-hidden", "false");
  document.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  const steps: Record<string, string> = {
    code: "YOUR INVITATION",
    household: "A PLACE FOR YOU",
    create: "YOUR ACCOUNT",
    signin: "WELCOME BACK",
    verify: "ONE LAST THING",
    reset: "ACCOUNT HELP",
    password: "ACCOUNT HELP",
  };
  get("[data-step]").textContent = steps[name];
  message("");
  if (!configured)
    message("Guest registration is not open yet. Please try again soon.");
  if (focus)
    get<HTMLElement>(`[data-panel="${name}"] h2`).focus({
      preventScroll: true,
    });
}
function showInvitation() {
  delete document.documentElement.dataset.guestView;
  hero.hidden = false;
  home.hidden = true;
  card.classList.remove("is-flipped");
  front.inert = false;
  front.setAttribute("aria-hidden", "false");
  back.inert = true;
  back.setAttribute("aria-hidden", "true");
  document
    .querySelectorAll<HTMLInputElement>('input[type="password"]')
    .forEach((input) => {
      input.value = "";
    });
  message("");
  get<HTMLButtonElement>('[data-card-mode="rsvp"]').focus({
    preventScroll: true,
  });
}
function guests(selector: string, data: Household) {
  get(selector).replaceChildren(
    ...data.guests.map((guest) => {
      const li = document.createElement("li");
      li.textContent = guest.name;
      return li;
    }),
  );
}
function renderHome(data: GuestHome) {
  document.documentElement.dataset.guestView = "home";
  window.scrollTo({ top: 0, behavior: "instant" });
  currentHome = data;
  hero.hidden = true;
  home.hidden = false;
  get("[data-guest-name]").textContent = data.display_name;
  get("[data-home-household]").textContent = data.label;
  get("[data-home-type]").textContent = homeTypes[data.guest_type];
  guests("[data-home-guests]", data);
  get("[data-home-preview]").hidden = !preview;
  get("[data-home-feedback]").hidden = true;
  const avatar = get(".header-avatar");
  get("[data-avatar-initial]").textContent =
    data.display_name.trim().slice(0, 1).toUpperCase();
  avatar.setAttribute("aria-label", "Open your wedding profile");
  get("#guest-home-title").focus({ preventScroll: true });
  void hydrateMenu(data.display_name);
  void hydrateSocial();
}
async function restore() {
  if (recovering) {
    showPanel("password");
    return;
  }
  const data = await loadHome();
  if (data) {
    forgetCode();
    renderHome(data);
    return;
  }
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const code = pendingCode();
      if (code) {
        await claimInvitation(code);
        const linked = await loadHome();
        if (linked) {
          renderHome(linked);
          return;
        }
      }
      showPanel("code");
      message(
        "You’re signed in. Enter your invitation code to link your household.",
        true,
      );
    }
  }
}
async function run(action: () => Promise<void>) {
  if (busy) return;
  busy = true;
  message("");
  const controls = [
    ...document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      ".onboarding input, .onboarding button",
    ),
  ];
  controls.forEach((control) => {
    control.disabled = true;
  });
  back.setAttribute("aria-busy", "true");
  try {
    await action();
  } catch (error) {
    message(
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.",
    );
  } finally {
    controls.forEach((control) => {
      control.disabled = false;
    });
    back.removeAttribute("aria-busy");
    busy = false;
  }
}
function form(selector: string, action: (data: FormData) => Promise<void>) {
  get<HTMLFormElement>(selector).addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    void run(() => action(data));
  });
}
const value = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();

document
  .querySelectorAll<HTMLButtonElement>("[data-flip-card]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      if (!busy)
        showPanel(button.dataset.cardMode === "signin" ? "signin" : "code");
    });
  });
document
  .querySelectorAll<HTMLButtonElement>("[data-panel-link]")
  .forEach((button) => {
    button.addEventListener("click", () =>
      showPanel(button.dataset.panelLink!),
    );
  });
get("[data-back-invitation]").addEventListener("click", showInvitation);
get("[data-change-code]").addEventListener("click", () => {
  household = null;
  forgetCode();
  showPanel("code");
});
get(".header-avatar").addEventListener("click", () => {
  if (busy) return;
  if (!currentHome) showPanel("signin");
});
get("[data-preview-note]").hidden = !preview;
if (preview) {
  get("[data-real-credentials]").hidden = true;
  get("[data-real-credentials]")
    .querySelectorAll<HTMLInputElement>("input")
    .forEach((input) => {
      input.required = false;
    });
  get("[data-create-submit]").textContent = "Continue preview";
  get("[data-create-copy]").textContent =
    "Choose a display name to preview your welcome page. No email or password is needed.";
}

form("[data-code-form]", async (data) => {
  const code = value(data, "code");
  household = await lookupInvitation(code);
  rememberCode(code);
  get("[data-household-label]").textContent = household.label;
  get("[data-household-type]").textContent = types[household.guest_type];
  guests("[data-household-guests]", household);
  showPanel("household");
});
get("[data-confirm-household]").addEventListener(
  "click",
  () =>
    void run(async () => {
      if (!household) {
        showPanel("code");
        return;
      }
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          await claimInvitation(pendingCode() || "");
          await restore();
          return;
        }
      }
      showPanel("create");
    }),
);
form("[data-create-form]", async (data) => {
  const name = value(data, "name");
  if (!name) throw new Error("Please enter your name.");
  if (!household || !pendingCode()) {
    showPanel("code");
    return;
  }
  if (preview) {
    savePreview(household, name);
    await restore();
    return;
  }
  if (!supabase) throw new Error("Guest registration is not open yet.");
  const { data: result, error } = await supabase.auth.signUp({
    email: value(data, "email"),
    password: String(data.get("password")),
    options: { data: { full_name: name }, emailRedirectTo: returnUrl() },
  });
  get<HTMLInputElement>("#create-password").value = "";
  if (error) throw new Error(error.message);
  if (result.session) {
    await claimInvitation(pendingCode()!);
    await restore();
  } else showPanel("verify");
});
form("[data-signin-form]", async (data) => {
  if (!supabase) throw new Error("Guest sign-in is not open yet.");
  const { error } = await supabase.auth.signInWithPassword({
    email: value(data, "email"),
    password: String(data.get("password")),
  });
  get<HTMLInputElement>("#signin-password").value = "";
  if (error)
    throw new Error(
      "We couldn’t sign you in. Check your email and password, and confirm your email if this is your first visit.",
    );
  await restore();
});
form("[data-reset-form]", async (data) => {
  if (!supabase) throw new Error("Guest sign-in is not open yet.");
  const { error } = await supabase.auth.resetPasswordForEmail(
    value(data, "email"),
    { redirectTo: returnUrl() },
  );
  if (error)
    throw new Error("We couldn’t send the reset link. Please try again later.");
  message(
    "If an account exists for that address, a password reset link is on its way.",
    true,
  );
});
form("[data-password-form]", async (data) => {
  if (!supabase) return;
  const { error } = await supabase.auth.updateUser({
    password: String(data.get("password")),
  });
  get<HTMLInputElement>("#new-password").value = "";
  if (error)
    throw new Error(
      "This reset link may have expired. Request another link and try again.",
    );
  recovering = false;
  await restore();
});
get<HTMLButtonElement>("[data-signout]").addEventListener(
  "click",
  async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
      await signOut();
      currentHome = null;
      household = null;
      document
        .querySelectorAll<HTMLFormElement>(".onboarding form")
        .forEach((item) => item.reset());
      get("[data-avatar-initial]").textContent = "○";
      get(".header-avatar").setAttribute("aria-label", "Guest profile");
      showInvitation();
    } catch (error) {
      const status = get("[data-home-feedback]");
      status.hidden = false;
      status.textContent =
        error instanceof Error ? error.message : "Please try again.";
    } finally {
      button.disabled = false;
    }
  },
);
// Keep auth callbacks synchronous; calling Supabase methods inside them can deadlock.
supabase?.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    recovering = true;
    showPanel("password");
  }
  if (event === "SIGNED_OUT") {
    currentHome = null;
    get("[data-avatar-initial]").textContent = "○";
    showInvitation();
  }
  if (event === "SIGNED_IN" && !busy && !recovering) {
    setTimeout(
      () =>
        void restore().catch((error) => {
          showPanel("code");
          message(error.message);
        }),
      0,
    );
  }
});
const callbackError = new URLSearchParams(location.hash.slice(1)).get(
  "error_description",
);
if (callbackError) {
  history.replaceState(null, "", location.pathname);
  showPanel("signin");
  message(
    "That email link has expired or is invalid. Sign in or request a new password reset link.",
  );
} else {
  void restore().catch((error) => {
    showPanel("code");
    message(error.message);
  });
}
