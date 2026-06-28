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

async function readFixtures(file, phase, displayOffset = 0) {
  try {
    const fixtures = JSON.parse(await fs.readFile(path.join(ROOT, "data", file), "utf8"));
    return fixtures.map((match, index) => ({
      ...match,
      phase: match.phase || phase,
      lockAt: match.lockAt || match.date,
      displayOrder: displayOffset + index + 1,
    }));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

const fixtures = await readFixtures("round32-fixtures.json", "round32", 72);

const rows = fixtures.map((match) => ({
  id: match.id,
  phase: match.phase,
  group_name: match.group,
  matchday: match.matchday,
  match_date: match.date,
  lock_at: match.lockAt,
  venue: match.venue,
  home_team: match.home,
  away_team: match.away,
  display_order: match.displayOrder,
}));

const response = await fetch(`${SUPABASE_URL}/rest/v1/fixtures?on_conflict=id`, {
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
