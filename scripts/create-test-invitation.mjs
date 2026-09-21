// Generate a fresh fictional household fixture. Run SQL in a test Supabase project.
// The raw invitation code stays out of the database and source control.
import { randomBytes, createHash, randomUUID } from "node:crypto";
const code = randomBytes(16).toString("hex").toUpperCase();
const hash = createHash("sha256").update(code).digest("hex");
const id = randomUUID();
console.log(`-- Test invitation code: ${code.match(/.{4}/g).join("-")}`);
console.log(`begin;
insert into public.wedding_households(id, label, guest_type) values ('${id}', 'The Taylor household (test)', 'day');
insert into public.wedding_guests(household_id, name) values ('${id}', 'Jamie Taylor'), ('${id}', 'Sam Taylor');
insert into public.wedding_invitations(code_hash, household_id) values ('${hash}', '${id}');
commit;`);
