import { loadProfileSummary, type ProfileSummary } from "../lib/guest-service";
import { menuCourses } from "../data/menu";

const toggle = document.querySelector<HTMLButtonElement>("[data-profile-toggle]");
const drawer = document.querySelector<HTMLElement>("[data-guest-profile]");
const panel = drawer?.querySelector<HTMLElement>(".guest-profile__panel");
const loading = drawer?.querySelector<HTMLElement>("[data-profile-loading]");
const content = drawer?.querySelector<HTMLElement>("[data-profile-content]");
const error = drawer?.querySelector<HTMLElement>("[data-profile-error]");
const badge = document.querySelector<HTMLElement>("[data-profile-badge]");
const mealContainer = drawer?.querySelector<HTMLElement>("[data-profile-meals]");
const tasksContainer = drawer?.querySelector<HTMLElement>("[data-profile-tasks]");
const completeNote = drawer?.querySelector<HTMLElement>("[data-profile-complete]");
const taskCount = drawer?.querySelector<HTMLElement>("[data-profile-task-count]");

const mealLabels = Object.fromEntries(
  menuCourses.flatMap((course) =>
    course.options.map((option) => [option.id, option.name]),
  ),
) as Record<string, string>;

const guestTypeLabels = {
  day: "Day guests",
  evening: "Evening guests",
  weddingParty: "Wedding party",
};

let lastFocused: HTMLElement | null = null;
let currentSummary: ProfileSummary | null = null;

function setBadge(summary: ProfileSummary | null) {
  if (!badge) return;
  if (!summary) {
    badge.hidden = true;
    return;
  }
  const pending =
    Number(!summary.tasks.meals_complete) +
    Number(!summary.tasks.message_complete) +
    Number(!summary.tasks.suggestion_complete);
  badge.textContent = String(pending);
  badge.hidden = pending === 0;
  badge.setAttribute(
    "aria-label",
    pending === 1 ? "1 task to finish" : pending + " tasks to finish",
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function choiceLabel(value: string | null) {
  return value ? mealLabels[value] || value : "Not chosen yet";
}

function renderMeals(summary: ProfileSummary) {
  if (!mealContainer) return;

  mealContainer.replaceChildren(
    ...summary.guests.map((guest) => {
      const card = document.createElement("article");
      card.className = "profile-meal-card";

      const head = document.createElement("div");
      head.className = "profile-meal-card__head";

      const avatar = document.createElement("span");
      avatar.className = "profile-meal-card__avatar";
      avatar.textContent = initials(guest.name);

      const identity = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = guest.name;
      const status = document.createElement("span");
      status.className =
        "profile-meal-card__status" +
        (guest.menu_complete ? " is-complete" : "");
      status.textContent = guest.menu_complete ? "Complete" : "Needs choices";
      identity.append(name, status);
      head.append(avatar, identity);

      const list = document.createElement("dl");
      const courses: Array<[string, string | null]> = [
        ["Starter", guest.starter],
        ["Main", guest.main],
        ["Dessert", guest.dessert],
      ];

      courses.forEach(([label, value]) => {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = choiceLabel(value);
        if (!value) dd.classList.add("is-missing");
        row.append(dt, dd);
        list.append(row);
      });

      card.append(head, list);
      return card;
    }),
  );
}

function taskRow(
  title: string,
  copy: string,
  complete: boolean,
  actionLabel: string,
  target: string,
  action?: string,
) {
  const row = document.createElement("article");
  row.className = "profile-task" + (complete ? " is-complete" : "");

  const marker = document.createElement("span");
  marker.className = "profile-task__marker";
  marker.textContent = complete ? "✓" : "•";

  const body = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = complete ? "Done — thank you!" : copy;
  body.append(heading, paragraph);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = complete ? "Done" : actionLabel;
  button.disabled = complete;
  button.dataset.profileJump = target;
  if (action) button.dataset.profileAction = action;

  row.append(marker, body, button);
  return row;
}

function renderTasks(summary: ProfileSummary) {
  if (!tasksContainer || !completeNote) return;

  const pending = [
    !summary.tasks.meals_complete,
    !summary.tasks.message_complete,
    !summary.tasks.suggestion_complete,
  ].filter(Boolean).length;

  if (taskCount) {
    taskCount.textContent =
      pending === 0 ? "Complete" : pending + (pending === 1 ? " left" : " left");
  }

  tasksContainer.replaceChildren(
    taskRow(
      "Choose your food",
      summary.tasks.meal_guests_remaining === 1
        ? "One guest still needs a starter, main and dessert."
        : summary.tasks.meal_guests_remaining + " guests still need their choices.",
      summary.tasks.meals_complete,
      "Choose food",
      "#menu",
    ),
    taskRow(
      "Leave us a message",
      "Add a note, memory or a bit of wedding advice.",
      summary.tasks.message_complete,
      "Write message",
      "#share",
      "message",
    ),
    taskRow(
      "Suggest a honeymoon destination",
      "Tell us somewhere you loved and why we should go.",
      summary.tasks.suggestion_complete,
      "Suggest a place",
      "#share",
      "suggestion",
    ),
  );

  completeNote.hidden = pending !== 0;
}

function render(summary: ProfileSummary) {
  currentSummary = summary;

  const name = drawer?.querySelector<HTMLElement>("[data-profile-name]");
  const household = drawer?.querySelector<HTMLElement>("[data-profile-household]");
  const type = drawer?.querySelector<HTMLElement>("[data-profile-type]");
  const avatar = drawer?.querySelector<HTMLElement>("[data-profile-avatar]");

  if (name) name.textContent = summary.display_name;
  if (household) household.textContent = summary.household_label;
  if (type) {
    type.textContent =
      guestTypeLabels[summary.guest_type] +
      " · " +
      summary.guests.length +
      (summary.guests.length === 1 ? " guest" : " guests");
  }
  if (avatar) avatar.textContent = initials(summary.display_name) || "♡";

  renderMeals(summary);
  renderTasks(summary);
  setBadge(summary);
}

async function refresh() {
  if (!drawer) return;
  if (loading) loading.hidden = false;
  if (content) content.hidden = true;
  if (error) error.hidden = true;

  try {
    const summary = await loadProfileSummary();
    render(summary);
    if (content) content.hidden = false;
  } catch (caught) {
    if (error) {
      error.textContent =
        caught instanceof Error ? caught.message : "We could not load your profile.";
      error.hidden = false;
    }
  } finally {
    if (loading) loading.hidden = true;
  }
}

function setOpen(open: boolean) {
  if (!drawer || !toggle) return;

  toggle.setAttribute("aria-expanded", String(open));
  drawer.setAttribute("aria-hidden", String(!open));
  drawer.classList.toggle("is-open", open);
  document.documentElement.classList.toggle("profile-open", open);

  if (open) {
    document
      .querySelector<HTMLElement>("[data-guest-nav].is-open [data-nav-close]")
      ?.click();

    lastFocused = document.activeElement as HTMLElement;
    void refresh();
    window.requestAnimationFrame(() =>
      panel?.querySelector<HTMLButtonElement>("[data-profile-close]")?.focus(),
    );
  } else {
    lastFocused?.focus({ preventScroll: true });
  }
}

toggle?.addEventListener("click", () => {
  if (document.documentElement.dataset.guestView !== "home") return;
  setOpen(!drawer?.classList.contains("is-open"));
});

drawer
  ?.querySelectorAll<HTMLButtonElement>("[data-profile-close]")
  .forEach((button) => button.addEventListener("click", () => setOpen(false)));

drawer?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-profile-jump]",
  );
  if (!button || button.disabled) return;

  const target = document.querySelector<HTMLElement>(
    button.dataset.profileJump || "",
  );
  const action = button.dataset.profileAction;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  setOpen(false);
  window.requestAnimationFrame(() => {
    target?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });

    if (action) {
      window.setTimeout(
        () => {
          if (action === "message") {
            document.querySelector<HTMLButtonElement>("[data-open-message]")?.click();
          }
          if (action === "suggestion") {
            document
              .querySelector<HTMLButtonElement>("[data-open-suggestion]")
              ?.click();
          }
        },
        reduced ? 0 : 450,
      );
    }
  });
});

drawer
  ?.querySelector<HTMLButtonElement>("[data-profile-signout]")
  ?.addEventListener("click", () => {
    setOpen(false);
    document.querySelector<HTMLButtonElement>("[data-signout]")?.click();
  });

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drawer?.classList.contains("is-open")) {
    setOpen(false);
  }

  if (
    event.key === "Tab" &&
    drawer?.classList.contains("is-open") &&
    panel
  ) {
    const focusable = [
      ...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href]',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

const viewObserver = new MutationObserver(() => {
  if (document.documentElement.dataset.guestView !== "home") {
    if (drawer?.classList.contains("is-open")) setOpen(false);
    setBadge(null);
  } else if (!currentSummary) {
    void refresh();
  }
});

viewObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-guest-view"],
});

window.addEventListener("guest-profile-refresh", () => void refresh());

if (document.documentElement.dataset.guestView === "home") {
  void refresh();
}
