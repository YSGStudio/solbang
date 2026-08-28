/**
 * T20. Creates the test accounts the PRD's verification plan expects:
 * one admin, two approved teachers, one unapproved teacher, plus the
 * reference rows in supabase/seed.sql.
 *
 *   node --experimental-strip-types scripts/seed.ts
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY pointing at a
 * real project. Refuses to run unless SEED_ALLOW_NON_LOCAL=1, so it cannot be
 * pointed at production by accident.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
  );
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url);
if (!isLocal && process.env.SEED_ALLOW_NON_LOCAL !== "1") {
  console.error(
    `Refusing to seed a non-local project (${url}).\n` +
      "Set SEED_ALLOW_NON_LOCAL=1 if you really mean it.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = process.env.SEED_PASSWORD ?? "shareschool-dev-1234";

const ACCOUNTS = [
  { email: "admin@shareschool.test",    fullName: "운영자",   nickname: "운영자",     role: "admin",   status: "approved" },
  { email: "teacher.a@shareschool.test", fullName: "김나눔",  nickname: "나눔하는김쌤", role: "teacher", status: "approved" },
  { email: "teacher.b@shareschool.test", fullName: "이모임",  nickname: "모임여는이쌤", role: "teacher", status: "approved" },
  { email: "pending@shareschool.test",   fullName: "박대기",  nickname: "대기중박쌤",   role: "teacher", status: "pending" },
] as const;

async function upsertAccount(account: (typeof ACCOUNTS)[number]) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: account.fullName,
      nickname: account.nickname,
    },
  });

  let userId = created?.user?.id;

  if (error) {
    if (!/already been registered|already exists/i.test(error.message)) {
      throw new Error(`${account.email}: ${error.message}`);
    }
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email === account.email)?.id;
    if (!userId) throw new Error(`${account.email}: could not resolve user id`);
  }

  // The on_auth_user_created trigger already made the profile as `pending`.
  // Move it to its target role and status with the service role.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: account.fullName,
      nickname: account.nickname,
      role: account.role,
      status: account.status,
    })
    .eq("id", userId!);

  if (profileError) throw new Error(`${account.email}: ${profileError.message}`);

  console.log(`  ${account.email.padEnd(32)} ${account.role}/${account.status}`);
  return userId!;
}

async function main() {
  console.log("==> accounts (password: " + PASSWORD + ")");
  for (const account of ACCOUNTS) await upsertAccount(account);

  console.log("\n==> reference data");
  const sql = readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8");
  console.log(
    "  supabase/seed.sql is not executed from here (no SQL endpoint on the\n" +
      "  client). Apply it with `supabase db push` or paste it into the SQL\n" +
      `  editor. It is ${sql.split("\n").length} lines.`,
  );

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
