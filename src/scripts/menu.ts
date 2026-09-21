import {
  loadMenuChoices,
  saveMealChoices,
  type MealGuest,
} from "../lib/guest-service";

type Course = "starter" | "main" | "dessert";
type DraftGuest = MealGuest & { dirty?: boolean };

const root = document.querySelector<HTMLElement>("[data-menu-app]");
const courseIds: Course[] = ["starter", "main", "dessert"];
let guests: DraftGuest[] = [];
let activeGuestId = "";
let displayName = "";
let loadVersion = 0;

const menuStatus = root?.querySelector<HTMLElement>("[data-menu-status]");
const loading = root?.querySelector<HTMLElement>("[data-menu-loading]");
const courses = root?.querySelector<HTMLElement>("[data-menu-courses]");
const guestList = root?.querySelector<HTMLElement>("[data-menu-guests]");
const saveButton = root?.querySelector<HTMLButtonElement>("[data-menu-save]");
const saveName = root?.querySelector<HTMLElement>("[data-menu-save-name]");
const nextButton = root?.querySelector<HTMLButtonElement>("[data-menu-next]");
const nextName = root?.querySelector<HTMLElement>("[data-menu-next-name]");
const completeNote = root?.querySelector<HTMLElement>("[data-menu-complete]");

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

const complete = (guest: DraftGuest) =>
  guest.attendance_status === "attending" &&
  Boolean(guest.starter && guest.main && guest.dessert);

const editable = (guest: DraftGuest) =>
  guest.attendance_status === "attending";

const activeGuest = () => guests.find((guest) => guest.id === activeGuestId);

function setStatus(text: string, tone: "success" | "error" | "info" = "info") {
  if (!menuStatus) return;
  menuStatus.textContent = text;
  menuStatus.dataset.tone = tone;
  menuStatus.hidden = !text;
}

function renderGuestList() {
  if (!guestList) return;
  guestList.replaceChildren(
    ...guests.map((guest) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-guest-chip";
      button.dataset.menuGuest = guest.id;
      button.setAttribute(
        "aria-pressed",
        String(guest.id === activeGuestId),
      );

      const avatar = document.createElement("span");
      avatar.className = "menu-guest-chip__avatar";
      avatar.textContent = initials(guest.name);

      const label = document.createElement("span");
      label.className = "menu-guest-chip__label";
      label.textContent =
        displayName &&
        guest.name.trim().toLowerCase() === displayName.trim().toLowerCase()
          ? guest.name + " (You)"
          : guest.name;

      const state = document.createElement("span");
      state.className = "menu-guest-chip__state";
      state.textContent =
        guest.attendance_status === "declined"
          ? "—"
          : guest.attendance_status === null
            ? "!"
            : complete(guest) && !guest.dirty
              ? "✓"
              : "";
      button.classList.toggle("is-declined", guest.attendance_status === "declined");
      button.classList.toggle("needs-rsvp", guest.attendance_status === null);
      state.setAttribute("aria-hidden", "true");

      button.append(avatar, label, state);
      button.addEventListener("click", () => selectGuest(guest.id));
      return button;
    }),
  );
}

function syncChoices(scroll = false) {
  const guest = activeGuest();
  if (!guest || !root) return;

  root.querySelectorAll<HTMLButtonElement>("[data-menu-option]").forEach(
    (button) => {
      const course = button.dataset.menuCourse as Course;
      const selected = guest[course] === button.dataset.menuOption;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.disabled = !editable(guest);
    },
  );

  if (saveName) saveName.textContent = guest.name;
  if (saveButton) {
    saveButton.disabled = !complete(guest);
    saveButton.classList.toggle("is-ready", complete(guest));
    saveButton.textContent =
      guest.attendance_status === "declined"
        ? guest.name + " is not attending"
        : guest.attendance_status === null
          ? "Complete " + guest.name + "’s RSVP first"
          : "Save choices for " + guest.name + " →";
  }

  syncNextGuest();

  if (scroll) {
    for (const course of courseIds) {
      const carousel = root.querySelector<HTMLElement>(
        '[data-carousel="' + course + '"]',
      );
      if (!carousel) continue;
      const selected = carousel.querySelector<HTMLElement>(
        '[data-menu-option="' + (guest[course] || "") + '"]',
      );
      const target =
        selected ??
        carousel.querySelector<HTMLElement>("[data-menu-option]");
      if (target) {
        const left =
          target.offsetLeft - (carousel.clientWidth - target.clientWidth) / 2;
        carousel.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
      }
    }
  }
}

function nextGuestCandidate() {
  if (guests.length < 2) return null;
  const current = Math.max(
    0,
    guests.findIndex((guest) => guest.id === activeGuestId),
  );
  const ordered = [
    ...guests.slice(current + 1),
    ...guests.slice(0, current),
  ];
  return (
    ordered.find(
      (guest) =>
        guest.attendance_status === "attending" &&
        (!complete(guest) || guest.dirty),
    ) ?? null
  );
}

function syncNextGuest() {
  const next = nextGuestCandidate();
  if (!nextButton || !nextName) return;
  nextButton.hidden = !next;
  const attending = guests.filter(
    (guest) => guest.attendance_status === "attending",
  );
  const allSaved =
    attending.length > 0 &&
    attending.every((guest) => complete(guest) && !guest.dirty);
  if (completeNote) completeNote.hidden = !allSaved;
  if (next) {
    nextName.textContent = next.name;
    nextButton.dataset.nextGuest = next.id;
  }
}

function selectGuest(id: string) {
  if (!guests.some((guest) => guest.id === id)) return;
  activeGuestId = id;
  setStatus("");
  renderGuestList();
  syncChoices(true);
}

export async function hydrateMenu(name = displayName) {
  if (!root) return;
  displayName = name || displayName;
  const version = ++loadVersion;
  if (loading) loading.hidden = false;
  if (courses) courses.hidden = true;
  setStatus("");

  try {
    const data = await loadMenuChoices();
    if (version !== loadVersion) return;
    guests = data.guests.map((guest) => ({ ...guest, dirty: false }));

    if (!guests.length) {
      setStatus(
        "We could not find any guests attached to this invitation.",
        "error",
      );
      return;
    }

    const you = guests.find(
      (guest) =>
        displayName &&
        guest.name.trim().toLowerCase() === displayName.trim().toLowerCase(),
    );
    activeGuestId =
      (you && editable(you) ? you.id : undefined) ??
      guests.find(editable)?.id ??
      you?.id ??
      guests[0].id;
    renderGuestList();
    syncChoices(true);
    if (courses) courses.hidden = false;
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : "We could not load your menu choices.",
      "error",
    );
  } finally {
    if (version === loadVersion && loading) loading.hidden = true;
  }
}

root?.querySelectorAll<HTMLButtonElement>("[data-menu-option]").forEach(
  (button) => {
    button.addEventListener("click", () => {
      const guest = activeGuest();
      const course = button.dataset.menuCourse as Course;
      const option = button.dataset.menuOption;
      if (!guest || !course || !option || !editable(guest)) return;

      guest[course] = option;
      guest.dirty = true;
      setStatus("Unsaved changes for " + guest.name + ".", "info");
      renderGuestList();
      syncChoices();
    });
  },
);

function updateDots(carousel: HTMLElement) {
  if (!root) return;
  const course = carousel.dataset.carousel;
  if (!course) return;
  const cards = [
    ...carousel.querySelectorAll<HTMLElement>("[data-menu-option]"),
  ];
  if (!cards.length) return;

  const centre = carousel.scrollLeft + carousel.clientWidth / 2;
  let active = 0;
  let distance = Number.POSITIVE_INFINITY;
  cards.forEach((card, index) => {
    const cardCentre = card.offsetLeft + card.clientWidth / 2;
    const nextDistance = Math.abs(cardCentre - centre);
    if (nextDistance < distance) {
      distance = nextDistance;
      active = index;
    }
  });

  root
    .querySelectorAll<HTMLButtonElement>(
      '[data-carousel-dot="' + course + '"]',
    )
    .forEach((dot, index) => {
      dot.classList.toggle("is-active", index === active);
    });
}

root?.querySelectorAll<HTMLElement>("[data-carousel]").forEach((carousel) => {
  let raf = 0;
  carousel.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => updateDots(carousel));
  });
});

root?.querySelectorAll<HTMLButtonElement>("[data-carousel-prev]").forEach(
  (button) => {
    button.addEventListener("click", () => {
      const carousel = root.querySelector<HTMLElement>(
        '[data-carousel="' + button.dataset.carouselPrev + '"]',
      );
      carousel?.scrollBy({
        left: -Math.max(260, carousel.clientWidth * 0.78),
        behavior: "smooth",
      });
    });
  },
);

root?.querySelectorAll<HTMLButtonElement>("[data-carousel-next]").forEach(
  (button) => {
    button.addEventListener("click", () => {
      const carousel = root.querySelector<HTMLElement>(
        '[data-carousel="' + button.dataset.carouselNext + '"]',
      );
      carousel?.scrollBy({
        left: Math.max(260, carousel.clientWidth * 0.78),
        behavior: "smooth",
      });
    });
  },
);

root?.querySelectorAll<HTMLButtonElement>("[data-carousel-dot]").forEach(
  (button) => {
    button.addEventListener("click", () => {
      const course = button.dataset.carouselDot;
      const index = Number(button.dataset.carouselIndex || 0);
      const carousel = root.querySelector<HTMLElement>(
        '[data-carousel="' + course + '"]',
      );
      const card = carousel?.querySelectorAll<HTMLElement>(
        "[data-menu-option]",
      )[index];
      if (!carousel || !card) return;
      const left =
        card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
      carousel.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    });
  },
);

saveButton?.addEventListener("click", async () => {
  const guest = activeGuest();
  if (!guest || !guest.starter || !guest.main || !guest.dessert) return;

  saveButton.disabled = true;
  saveButton.setAttribute("aria-busy", "true");
  setStatus("Saving " + guest.name + "’s choices…", "info");

  try {
    const saved = await saveMealChoices(guest.id, {
      starter: guest.starter,
      main: guest.main,
      dessert: guest.dessert,
    });
    Object.assign(guest, saved, { dirty: false });
    setStatus("Choices saved for " + guest.name + ".", "success");
    renderGuestList();
    syncChoices();
    window.dispatchEvent(new Event("guest-profile-refresh"));
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "We could not save the menu.",
      "error",
    );
  } finally {
    saveButton.removeAttribute("aria-busy");
    saveButton.disabled = !complete(guest);
  }
});

nextButton?.addEventListener("click", () => {
  const next = nextButton.dataset.nextGuest;
  if (next) selectGuest(next);
});

window.addEventListener("guest-home-rendered", (event) => {
  const custom = event as CustomEvent<{ displayName?: string }>;
  void hydrateMenu(custom.detail?.displayName || "");
});

if (document.documentElement.dataset.guestView === "home") {
  void hydrateMenu();
}

window.addEventListener("guest-menu-refresh", () => void hydrateMenu(displayName));
