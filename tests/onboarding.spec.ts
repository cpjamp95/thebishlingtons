import { test, expect } from "@playwright/test";

test("mobile preview: invalid code, household, refresh, sign out and safe text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await page.getByLabel("Invitation code", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Find my invitation" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "not found" }),
  ).toBeVisible();
  await page.getByLabel("Invitation code", { exact: true }).fill("demo-day");
  await page.getByRole("button", { name: "Find my invitation" }).click();
  await expect(page.getByText("Jamie Taylor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yes, that’s us" }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Cameron <script>");
  await expect(
    page.getByLabel("Email address", { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Continue preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Cameron <script>" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your attendance has not been recorded yet."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome, Cameron <script>" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/guest-home-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "RSVP", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "RSVP", exact: true }),
  ).toBeVisible();
});

test("small phone and household correction preserve the invitation flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await page.getByLabel("Invitation code", { exact: true }).fill("DEMO-DAY");
  await page.getByRole("button", { name: "Find my invitation" }).click();
  await page.getByRole("button", { name: "Use a different code" }).click();
  await page
    .getByLabel("Invitation code", { exact: true })
    .fill("DEMO-EVENING");
  await page.getByRole("button", { name: "Find my invitation" }).click();
  await expect(page.getByText("Robin Morgan", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Join us for the evening celebration", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, that’s us" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/create-small-phone.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to invitation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "RSVP", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".invitation-card--back")).toHaveAttribute(
    "inert",
    "",
  );
});
