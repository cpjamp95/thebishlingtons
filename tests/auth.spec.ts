import { Buffer } from "node:buffer";
// Start with PUBLIC_ONBOARDING_PREVIEW=false PUBLIC_SUPABASE_URL=https://wedding-test.supabase.co
// PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable-key, then npm run test:auth.
// All Supabase requests are intercepted; no email is sent and no cloud state is modified.
import { test, expect, type Page } from "@playwright/test";
const household = {
  label: "The Taylor household",
  guest_type: "day",
  guests: [{ name: "Jamie Taylor" }, { name: "Sam Taylor" }],
};
const code = "ABCDEF0123456789ABCDEF0123456789";
const id = "33333333-3333-4333-8333-333333333333";
function token() {
  const encode = (item: object) =>
    Buffer.from(JSON.stringify(item)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
}
async function backend(page: Page, confirmed = true) {
  let linked = false;
  let claims = 0;
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "tester@example.com",
    email_confirmed_at: new Date().toISOString(),
    user_metadata: { full_name: "Cameron" },
    app_metadata: { provider: "email" },
    created_at: new Date().toISOString(),
  };
  const session = () => ({
    access_token: token(),
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    user,
  });
  await page.route("https://wedding-test.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let result: unknown = {};
    if (path.endsWith("/lookup_invitation")) result = household;
    else if (path.endsWith("/claim_invitation")) {
      linked = true;
      claims++;
      result = null;
    } else if (path.endsWith("/guest_home"))
      result = linked ? { ...household, display_name: "Cameron" } : null;
    else if (path.endsWith("/signup"))
      result = confirmed ? session() : { ...user, identities: [{ id }] };
    else if (path.endsWith("/token")) {
      if (route.request().postDataJSON()?.password === "wrong-password") {
        await route.fulfill({
          status: 400,
          json: {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
          },
        });
        return;
      }
      result = session();
    } else if (path.endsWith("/user")) result = user;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  return { claims: () => claims };
}
async function identify(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await page.getByLabel("Invitation code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Find my invitation" }).click();
  await page.getByRole("button", { name: "Yes, that’s us" }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Cameron");
  await page.locator("#create-email").fill("tester@example.com");
  await page.locator("#create-password").fill("test-password-123");
}
test("real SDK account path: link household, restore session, sign out and sign in", async ({
  page,
}) => {
  const state = await backend(page);
  await identify(page);
  await page
    .getByRole("button", { name: "Create my account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Cameron", exact: true }),
  ).toBeVisible();
  expect(state.claims()).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome, Cameron", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.locator("#signin-email").fill("tester@example.com");
  await page.locator("#signin-password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("[data-feedback]")).toContainText(
    "couldn’t sign you in",
  );
  await page.locator("#signin-password").fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Cameron", exact: true }),
  ).toBeVisible();
});
test("email confirmation blocks the dashboard until sign-in and claims the pending invitation", async ({
  page,
}) => {
  const state = await backend(page, false);
  await identify(page);
  await page.screenshot({
    path: "test-results/account-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create my account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox" }),
  ).toBeVisible();
  expect(state.claims()).toBe(0);
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await page.locator("#signin-email").fill("tester@example.com");
  await page.locator("#signin-password").fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Cameron", exact: true }),
  ).toBeVisible();
  expect(state.claims()).toBe(1);
});
test("password recovery callback opens the new password form", async ({
  page,
}) => {
  await backend(page);
  await page.goto(
    `/#access_token=${token()}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery`,
  );
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page
    .getByLabel("New password", { exact: true })
    .fill("updated-password-123");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re invited" }),
  ).toBeVisible();
});
