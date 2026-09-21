import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("invitation lookup and membership enforce household isolation in PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $ select nullif(current_setting('test.uid', true), '')::uuid $;
      create schema storage;
      create table storage.buckets(
        id text primary key,
        name text not null,
        public boolean not null default false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      create table storage.objects(name text, bucket_id text);
      create function storage.foldername(value text) returns text[]
      language sql immutable as $ select string_to_array(value, '/') $;
      grant usage on schema auth, storage to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    await db.exec(
      "alter default privileges in schema public grant execute on functions to anon, authenticated;",
    );
    const migrations = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(migrations))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await db.exec(await readFile(new URL(name, migrations), "utf8"));
    }
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    const user = "33333333-3333-4333-8333-333333333333";
    const other = "44444444-4444-4444-8444-444444444444";
    const codeA = "ABCDEF0123456789ABCDEF0123456789";
    const codeB = "0123456789ABCDEF0123456789ABCDEF";
    await db.exec(`insert into public.wedding_households values ('${a}', 'Household A', 'day'), ('${b}', 'Household B', 'evening');
      insert into public.wedding_guests(household_id,name) values ('${a}','Guest A'), ('${b}','Guest B');
      insert into public.wedding_invitations(code_hash,household_id) values
        (encode(sha256(convert_to('${codeA}', 'UTF8')), 'hex'),'${a}'),
        (encode(sha256(convert_to('${codeB}', 'UTF8')), 'hex'),'${b}');
      insert into auth.users values ('${user}', now(), '{"full_name":"Jamie","guest_type":"admin","household_id":"${b}"}'),
        ('${other}', null, '{"full_name":"Other"}');
      set role anon;`);
    for (const table of [
      "wedding_households",
      "wedding_guests",
      "wedding_invitations",
      "wedding_memberships",
    ]) {
      await assert.rejects(
        db.query(`select * from public.${table}`),
        /permission denied/,
      );
    }
    await assert.rejects(
      db.query("select public.guest_home()"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.claim_invitation($1)", [codeA]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.lookup_invitation($1)", ["bish-admin"]),
      /INVITATION_INVALID/,
    );
    await assert.rejects(
      db.query("select public.lookup_invitation($1)", [
        "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
      ]),
      /INVITATION_INVALID/,
    );
    const invitation = (
      await db.query("select public.lookup_invitation($1) as home", [
        " abcd-ef01-2345-6789-abcd-ef01-2345-6789 ",
      ])
    ).rows[0].home;
    assert.equal(invitation.label, "Household A");
    assert.deepEqual(invitation.guests, [{ name: "Guest A" }]);
    assert.equal(invitation.code_hash, undefined);
    await db.exec(
      `reset role; set role authenticated; select set_config('test.uid','${other}',false);`,
    );
    await assert.rejects(
      db.query("select public.claim_invitation($1)", [codeA]),
      /EMAIL_CONFIRMATION_REQUIRED/,
    );
    assert.equal(
      (await db.query("select public.guest_home() as home")).rows[0].home,
      null,
    );
    await db.exec(`select set_config('test.uid','${user}',false);`);
    await db.query("select public.claim_invitation($1)", [codeA]);
    await db.query("select public.claim_invitation($1)", [codeA]); // idempotent retry
    const rsvp = (await db.query("select public.rsvp_details() as details")).rows[0].details;
    assert.equal(rsvp.guests[0].attendance_status, null);
    const guestA = rsvp.guests[0].id;
    await db.query(
      "select public.save_guest_rsvp($1,$2,$3,$4)",
      [guestA, "attending", "Vegetarian", "Peanuts"],
    );
    const savedRsvp = (await db.query("select public.rsvp_details() as details")).rows[0].details;
    assert.equal(savedRsvp.guests[0].attendance_status, "attending");
    assert.equal(savedRsvp.guests[0].allergies, "Peanuts");
    await db.query(
      "select public.save_menu_choices($1,$2,$3,$4)",
      [guestA, "butternut-squash-soup", "wild-mushroom-risotto", "chocolate-fondant"],
    );
    const menu = (await db.query("select public.menu_choices() as menu")).rows[0].menu;
    assert.equal(menu.menu_version, 1);
    assert.equal(menu.guests[0].starter, "butternut-squash-soup");
    await assert.rejects(
      db.query("select public.claim_invitation($1)", [codeB]),
      /ALREADY_LINKED/,
    );
    const home = (await db.query("select public.guest_home() as home")).rows[0]
      .home;
    assert.equal(home.label, "Household A");
    assert.equal(home.guest_type, "day"); // forged metadata grants nothing
    assert.equal(home.display_name, "Jamie");
    assert.deepEqual(home.guests, [{ name: "Guest A" }]);
    await assert.rejects(
      db.query(
        `insert into public.wedding_memberships values ('${other}','${b}',now())`,
      ),
      /permission denied/,
    );
    await db.exec(
      `reset role; update public.wedding_invitations set revoked_at=now() where household_id='${b}'; set role anon;`,
    );
    await assert.rejects(
      db.query("select public.lookup_invitation($1)", [codeB]),
      /INVITATION_INVALID/,
    );
    await db.exec(
      `reset role; update public.wedding_invitations set expires_at=now()-interval '1 day' where household_id='${a}'; set role anon;`,
    );
    await assert.rejects(
      db.query("select public.lookup_invitation($1)", [codeA]),
      /INVITATION_INVALID/,
    );
  } finally {
    await db.close();
  }
});
