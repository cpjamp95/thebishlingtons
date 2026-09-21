import {
  adminStatus,
  loadAdminDashboard,
  type AdminDashboard,
} from "../lib/guest-service";

const root = document.querySelector<HTMLElement>("[data-admin-app]");
const state = root?.querySelector<HTMLElement>("[data-admin-state]");
const dashboard = root?.querySelector<HTMLElement>("[data-admin-dashboard]");
const summary = root?.querySelector<HTMLElement>("[data-admin-summary]");
const households = root?.querySelector<HTMLElement>("[data-admin-households]");
const messages = root?.querySelector<HTMLElement>("[data-admin-messages]");
const suggestions = root?.querySelector<HTMLElement>("[data-admin-suggestions]");
let current: AdminDashboard | null = null;

function stat(label: string, value: string) {
  const row = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = value;
  row.append(strong, span);
  return row;
}

function render(data: AdminDashboard) {
  current = data;
  const guests = data.households.flatMap((household) => household.guests);
  const attending = guests.filter(
    (guest) => guest.attendance_status === "attending",
  ).length;
  const declined = guests.filter(
    (guest) => guest.attendance_status === "declined",
  ).length;
  const waiting = guests.filter(
    (guest) => guest.attendance_status === null,
  ).length;
  const meals = guests.filter(
    (guest) =>
      guest.attendance_status === "attending" && guest.menu_complete,
  ).length;

  summary?.replaceChildren(
    stat("Invited", String(guests.length)),
    stat("Attending", String(attending)),
    stat("Declined", String(declined)),
    stat("Awaiting RSVP", String(waiting)),
    stat("Meals complete", meals + " / " + attending),
  );

  households?.replaceChildren(
    ...data.households.map((household) => {
      const card = document.createElement("article");
      card.className = "admin-household";
      const heading = document.createElement("h3");
      heading.textContent = household.label;
      const meta = document.createElement("p");
      meta.textContent =
        household.guest_type +
        " · " +
        household.guests.length +
        (household.guests.length === 1 ? " guest" : " guests");
      card.append(heading, meta);

      household.guests.forEach((guest) => {
        const row = document.createElement("div");
        row.className = "admin-guest";
        const name = document.createElement("strong");
        name.textContent = guest.name;
        const rsvp = document.createElement("span");
        rsvp.textContent = guest.attendance_status ?? "awaiting RSVP";
        const detail = document.createElement("small");
        const parts: string[] = [];
        if (guest.allergies) parts.push("ALLERGY: " + guest.allergies);
        if (guest.dietary_requirements)
          parts.push("Diet: " + guest.dietary_requirements);
        if (guest.attendance_status === "attending") {
          parts.push(
            "Menu: " +
              [guest.starter, guest.main, guest.dessert]
                .map((item) => item || "—")
                .join(" / "),
          );
        }
        detail.textContent = parts.join(" · ");
        row.append(name, rsvp, detail);
        card.append(row);
      });

      return card;
    }),
  );

  messages?.replaceChildren(
    ...data.messages.map((item) => {
      const card = document.createElement("article");
      const heading = document.createElement("strong");
      heading.textContent = item.author_name;
      const copy = document.createElement("p");
      copy.textContent = item.message;
      card.append(heading, copy);
      return card;
    }),
  );

  suggestions?.replaceChildren(
    ...data.suggestions.map((item) => {
      const card = document.createElement("article");
      const heading = document.createElement("strong");
      heading.textContent = item.destination + " · " + item.author_name;
      const copy = document.createElement("p");
      copy.textContent = item.story;
      card.append(heading, copy);
      return card;
    }),
  );
}

async function load() {
  if (!state || !dashboard) return;
  state.hidden = false;
  state.textContent = "Checking admin access…";
  dashboard.hidden = true;
  try {
    if (!(await adminStatus())) {
      state.textContent =
        "This account is signed in but has not been granted wedding-admin access.";
      return;
    }
    const data = await loadAdminDashboard();
    render(data);
    state.hidden = true;
    dashboard.hidden = false;
  } catch (error) {
    state.textContent =
      error instanceof Error
        ? error.message
        : "Admin dashboard could not be loaded.";
  }
}

root
  ?.querySelector("[data-admin-refresh]")
  ?.addEventListener("click", () => void load());

root?.querySelector("[data-admin-export]")?.addEventListener("click", () => {
  if (!current) return;
  const rows = [
    [
      "Household",
      "Guest",
      "Attendance",
      "Dietary requirements",
      "Allergies",
      "Starter",
      "Main",
      "Dessert",
    ],
  ];
  current.households.forEach((household) =>
    household.guests.forEach((guest) =>
      rows.push([
        household.label,
        guest.name,
        guest.attendance_status ?? "",
        guest.dietary_requirements ?? "",
        guest.allergies ?? "",
        guest.starter ?? "",
        guest.main ?? "",
        guest.dessert ?? "",
      ]),
    ),
  );
  const csv = rows
    .map((row) =>
      row
        .map((cell) => '"' + String(cell).replaceAll('"', '""') + '"')
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bishlingtons-catering.csv";
  link.click();
  URL.revokeObjectURL(url);
});

void load();
