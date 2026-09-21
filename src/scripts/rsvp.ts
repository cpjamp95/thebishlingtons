import {
  loadRsvpDetails,
  saveGuestRsvp,
  type AttendanceStatus,
  type RsvpGuest,
} from "../lib/guest-service";

const root = document.querySelector<HTMLElement>("[data-rsvp-app]");
const list = root?.querySelector<HTMLElement>("[data-rsvp-guests]");
const loading = root?.querySelector<HTMLElement>("[data-rsvp-loading]");
const status = root?.querySelector<HTMLElement>("[data-rsvp-status]");
let guests: RsvpGuest[] = [];
let loadVersion = 0;

function setStatus(text: string, tone: "success" | "error" | "info" = "info") {
  if (!status) return;
  status.textContent = text;
  status.dataset.tone = tone;
  status.hidden = !text;
}

function render() {
  if (!list) return;
  list.replaceChildren(
    ...guests.map((guest) => {
      const card = document.createElement("article");
      card.className = "rsvp-guest";

      const heading = document.createElement("div");
      heading.className = "rsvp-guest__heading";
      const name = document.createElement("h4");
      name.textContent = guest.name;
      const state = document.createElement("span");
      state.className = "rsvp-guest__state";
      state.textContent =
        guest.attendance_status === "attending"
          ? "Attending"
          : guest.attendance_status === "declined"
            ? "Not attending"
            : "RSVP needed";
      heading.append(name, state);

      const question = document.createElement("p");
      question.className = "rsvp-guest__question";
      question.textContent = "Will you be joining us?";

      const choices = document.createElement("div");
      choices.className = "rsvp-attendance";
      for (const [value, label] of [
        ["attending", "Joyfully accept"],
        ["declined", "Sadly decline"],
      ] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.attendance = value;
        const selected = guest.attendance_status === value;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
        choices.append(button);
      }

      const details = document.createElement("div");
      details.className = "rsvp-guest__details";
      details.hidden = guest.attendance_status !== "attending";

      const dietaryLabel = document.createElement("label");
      dietaryLabel.textContent = "Dietary requirements";
      const dietary = document.createElement("textarea");
      dietary.rows = 2;
      dietary.maxLength = 500;
      dietary.placeholder = "Vegetarian, vegan, gluten-free, etc.";
      dietary.value = guest.dietary_requirements ?? "";

      const allergyLabel = document.createElement("label");
      allergyLabel.textContent = "Allergies";
      const allergies = document.createElement("textarea");
      allergies.rows = 2;
      allergies.maxLength = 500;
      allergies.placeholder =
        "Please tell us about any food allergies, or leave blank.";
      allergies.value = guest.allergies ?? "";

      details.append(dietaryLabel, dietary, allergyLabel, allergies);

      const save = document.createElement("button");
      save.type = "button";
      save.className = "rsvp-guest__save";
      save.textContent = guest.attendance_status
        ? "Save / update RSVP"
        : "Save RSVP";
      save.disabled = guest.attendance_status === null;

      choices.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
          "[data-attendance]",
        );
        if (!button) return;
        guest.attendance_status = button.dataset
          .attendance as Exclude<AttendanceStatus, null>;
        details.hidden = guest.attendance_status !== "attending";
        choices.querySelectorAll<HTMLButtonElement>("button").forEach((item) => {
          const selected =
            item.dataset.attendance === guest.attendance_status;
          item.classList.toggle("is-selected", selected);
          item.setAttribute("aria-pressed", String(selected));
        });
        save.disabled = false;
        state.textContent = "Unsaved";
        state.classList.add("is-unsaved");
      });

      save.addEventListener("click", async () => {
        if (!guest.attendance_status) return;
        save.disabled = true;
        setStatus("Saving " + guest.name + "’s RSVP…");
        try {
          const saved = await saveGuestRsvp(
            guest.id,
            guest.attendance_status,
            dietary.value,
            allergies.value,
          );
          Object.assign(guest, saved);
          setStatus("RSVP saved for " + guest.name + " ♡", "success");
          render();
          window.dispatchEvent(new Event("guest-menu-refresh"));
          window.dispatchEvent(new Event("guest-profile-refresh"));
        } catch (error) {
          setStatus(
            error instanceof Error
              ? error.message
              : "We could not save that RSVP.",
            "error",
          );
          save.disabled = false;
        }
      });

      card.append(heading, question, choices, details, save);
      return card;
    }),
  );
}

export async function hydrateRsvp() {
  if (!root) return;
  const version = ++loadVersion;
  if (loading) loading.hidden = false;
  setStatus("");
  try {
    const data = await loadRsvpDetails();
    if (version !== loadVersion) return;
    guests = data.guests;
    render();
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "We could not load your RSVP.",
      "error",
    );
  } finally {
    if (version === loadVersion && loading) loading.hidden = true;
  }
}

window.addEventListener("guest-rsvp-refresh", () => void hydrateRsvp());
if (document.documentElement.dataset.guestView === "home") void hydrateRsvp();
