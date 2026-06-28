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
  await fs.readFile(path.join(ROOT, "data", "round32-fixtures.json"), "utf8"),
);
const matchIds = fixtures.map((match) => match.id);
const filter = `match_id=in.(${matchIds.join(",")})`;

async function deleteWhere(table, tableFilter) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${tableFilter}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal",
    },
  });

  if (!response.ok) {
    console.error(`No se pudo limpiar ${table}:`);
    console.error(await response.text());
    process.exit(1);
  }
}

await deleteWhere("results", filter);
await deleteWhere("predictions", filter);

console.log("Predicciones y resultados de dieciseisavos borrados. Participantes y fase de grupos quedan intactos.");
