const env = globalThis.process?.env || {};
const SUPABASE_URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function deleteWhere(table, filter) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
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

await deleteWhere("results", "match_id=not.is.null");
await deleteWhere("predictions", "participant_id=not.is.null");
await deleteWhere("participants", "id=not.is.null");

console.log("Datos de prueba borrados. El fixture queda intacto.");
