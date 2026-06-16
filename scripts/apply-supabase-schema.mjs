#!/usr/bin/env node
/**
 * Apply idempotent Supabase schema patches via the SQL API.
 * Requires SUPABASE_ACCESS_TOKEN (from `supabase login` or dashboard account token).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=fdsleazzlgtgypalnabh node scripts/apply-supabase-schema.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const projectRef =
  process.env.SUPABASE_PROJECT_REF?.trim() ||
  process.env.SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!token || !projectRef) {
  console.error(
    "Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (or SUPABASE_URL).",
  );
  process.exit(1);
}

const schemaPath = path.resolve("backend/supabase_schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);

const body = await res.text();
if (!res.ok) {
  console.error(`Schema apply failed (${res.status}):`, body.slice(0, 500));
  process.exit(1);
}

console.log("Supabase schema applied successfully.");
