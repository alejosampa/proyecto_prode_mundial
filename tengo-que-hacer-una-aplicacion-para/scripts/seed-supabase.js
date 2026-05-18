import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const env = globalThis.process?.env || {};
const SUPABASE_URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const fixtures = JSON.parse(
  await fs.readFile(path.join(ROOT, "data", "fixtures.json"), "utf8"),
);

const rows = fixtures.map((match, index) => ({
  id: match.id,
  group_name: match.group,
  matchday: match.matchday,
  match_date: match.date,
  venue: match.venue,
  home_team: match.home,
  away_team: match.away,
  display_order: index + 1,
}));

const response = await fetch(`${SUPABASE_URL}/rest/v1/fixtures`, {
  method: "POST",
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}

console.log(`Fixture cargado en Supabase: ${rows.length} partidos.`);
