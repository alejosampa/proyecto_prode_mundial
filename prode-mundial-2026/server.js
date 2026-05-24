import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const env = globalThis.process?.env || {};
const PORT = Number(env.PORT || 3000);
const ADMIN_KEY = env.ADMIN_KEY || "admin-2026";
const LOCK_AT = env.LOCK_AT || "2026-06-11T17:00:00-03:00";
const MATCH_LIMIT = Number(env.MATCH_LIMIT || 0);
const SUPABASE_URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const FIXTURES_FILE = path.join(DATA_DIR, "fixtures.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function ensureState() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STATE_FILE);
  } catch {
    await writeJson(STATE_FILE, {
      version: 1,
      lockAt: LOCK_AT,
      participants: [],
      predictions: [],
      results: {},
    });
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readLocalState() {
  await ensureState();
  const state = await readJson(STATE_FILE);
  state.fixtures = await readJson(FIXTURES_FILE);
  return state;
}

async function saveLocalState(state) {
  await writeJson(STATE_FILE, {
    version: state.version,
    lockAt: state.lockAt,
    participants: state.participants,
    predictions: state.predictions,
    results: state.results,
  });
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function supabaseRequest(resource, options = {}) {
  if (!USE_SUPABASE) throw createHttpError(500, "Supabase no esta configurado.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.message || body?.hint || "Error de Supabase";
    throw createHttpError(response.status, message);
  }
  return body;
}

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function toFixture(row) {
  return {
    id: row.id,
    group: row.group_name,
    matchday: row.matchday,
    date: row.match_date,
    venue: row.venue,
    home: row.home_team,
    away: row.away_team,
  };
}

function toParticipant(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    fullName: row.full_name,
    normalizedName: row.normalized_name,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
  };
}

function toPrediction(row) {
  return {
    participantId: row.participant_id,
    matchId: row.match_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
  };
}

function resultsObject(rows) {
  return rows.reduce((acc, row) => {
    acc[row.match_id] = {
      homeGoals: row.home_goals,
      awayGoals: row.away_goals,
      updatedAt: row.updated_at,
    };
    return acc;
  }, {});
}

function visibleFixtures(fixtures) {
  if (!Number.isInteger(MATCH_LIMIT) || MATCH_LIMIT <= 0) return fixtures;
  return fixtures.slice(0, MATCH_LIMIT);
}

function filterStateForVisibleFixtures(state) {
  const fixtures = visibleFixtures(state.fixtures);
  const fixtureIds = new Set(fixtures.map((match) => match.id));
  return {
    ...state,
    fixtures,
    predictions: state.predictions.filter((prediction) => fixtureIds.has(prediction.matchId)),
    results: Object.fromEntries(
      Object.entries(state.results || {}).filter(([matchId]) => fixtureIds.has(matchId)),
    ),
  };
}

async function readSupabaseState() {
  const [fixtureRows, participantRows, predictionRows, resultRows] = await Promise.all([
    supabaseRequest("fixtures?select=*&order=display_order.asc"),
    supabaseRequest("participants?select=*&order=created_at.asc"),
    supabaseRequest("predictions?select=*"),
    supabaseRequest("results?select=*"),
  ]);

  return {
    version: 1,
    lockAt: LOCK_AT,
    fixtures: fixtureRows.map(toFixture),
    participants: participantRows.map(toParticipant),
    predictions: predictionRows.map(toPrediction),
    results: resultsObject(resultRows),
  };
}

const localStore = {
  async getState() {
    return readLocalState();
  },

  async createParticipant(state, participant) {
    state.participants.push(participant);
    await saveLocalState(state);
    return participant;
  },

  async submitPredictions(state, participant, predictions) {
    participant.submittedAt = new Date().toISOString();
    state.predictions.push(...predictions);
    await saveLocalState(state);
    return participant;
  },

  async setResult(state, matchId, result) {
    state.results[matchId] = result;
    await saveLocalState(state);
  },

  async clearResult(state, matchId) {
    delete state.results[matchId];
    await saveLocalState(state);
  },

  async deleteParticipant(state, participantId) {
    state.participants = state.participants.filter((item) => item.id !== participantId);
    state.predictions = state.predictions.filter((item) => item.participantId !== participantId);
    await saveLocalState(state);
  },
};

const supabaseStore = {
  async getState() {
    return readSupabaseState();
  },

  async createParticipant(_state, participant) {
    const rows = await supabaseRequest("participants", {
      method: "POST",
      body: {
        id: participant.id,
        device_id: participant.deviceId,
        full_name: participant.fullName,
        normalized_name: participant.normalizedName,
        created_at: participant.createdAt,
        submitted_at: participant.submittedAt,
      },
    });
    return toParticipant(rows[0]);
  },

  async submitPredictions(state, participant, predictions) {
    const submittedAt = new Date().toISOString();
    await supabaseRequest("predictions", {
      method: "POST",
      body: predictions.map((prediction) => ({
        participant_id: prediction.participantId,
        match_id: prediction.matchId,
        home_goals: prediction.homeGoals,
        away_goals: prediction.awayGoals,
      })),
    });
    const rows = await supabaseRequest(`participants?id=${eq(participant.id)}`, {
      method: "PATCH",
      body: { submitted_at: submittedAt },
    });
    participant.submittedAt = submittedAt;
    state.predictions.push(...predictions);
    return rows[0] ? toParticipant(rows[0]) : participant;
  },

  async setResult(_state, matchId, result) {
    await supabaseRequest("results?on_conflict=match_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        match_id: matchId,
        home_goals: result.homeGoals,
        away_goals: result.awayGoals,
        updated_at: result.updatedAt,
      },
    });
  },

  async clearResult(_state, matchId) {
    await supabaseRequest(`results?match_id=${eq(matchId)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  },

  async deleteParticipant(_state, participantId) {
    await supabaseRequest(`participants?id=${eq(participantId)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  },
};

const store = USE_SUPABASE ? supabaseStore : localStore;

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createHttpError(400, "JSON invalido");
  }
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

function isLocked(state) {
  return Date.now() >= new Date(state.lockAt).getTime();
}

function cleanDisplayName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeName(value) {
  return cleanDisplayName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function validateFullName(value) {
  const fullName = cleanDisplayName(value);
  const parts = fullName.split(" ").filter(Boolean);
  const validNamePart = /^\p{L}+(?:['-]\p{L}+)*$/u;

  if (parts.length < 2) {
    return { valid: false, error: "Ingresa nombre y apellido." };
  }

  if (!parts.every((part) => validNamePart.test(part))) {
    return { valid: false, error: "El nombre solo puede tener letras, espacios, guiones o apostrofes." };
  }

  return {
    valid: true,
    fullName,
    normalizedName: normalizeName(fullName),
  };
}

function participantNameKey(participant) {
  return participant.normalizedName || normalizeName(participant.fullName);
}

function requireAdmin(url) {
  return url.searchParams.get("key") === ADMIN_KEY;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function scorePrediction(prediction, result) {
  if (!result) return { points: 0, exact: 0, winner: 0, status: "pending" };
  const exact =
    prediction.homeGoals === result.homeGoals &&
    prediction.awayGoals === result.awayGoals;
  if (exact) return { points: 4, exact: 1, winner: 0, status: "exact" };

  const predictedSign = Math.sign(prediction.homeGoals - prediction.awayGoals);
  const resultSign = Math.sign(result.homeGoals - result.awayGoals);
  if (predictedSign === resultSign) {
    return { points: 2, exact: 0, winner: 1, status: "winner" };
  }
  return { points: 0, exact: 0, winner: 0, status: "miss" };
}

function buildLeaderboard(state) {
  const results = state.results || {};
  const rows = state.participants.map((participant) => {
    const participantPredictions = state.predictions.filter(
      (prediction) => prediction.participantId === participant.id,
    );
    const totals = participantPredictions.reduce(
      (acc, prediction) => {
        const scored = scorePrediction(prediction, results[prediction.matchId]);
        acc.points += scored.points;
        acc.exacts += scored.exact;
        acc.winners += scored.winner;
        return acc;
      },
      { points: 0, exacts: 0, winners: 0 },
    );
    return {
      participantId: participant.id,
      fullName: participant.fullName,
      submittedAt: participant.submittedAt || null,
      predictionsCount: participantPredictions.length,
      ...totals,
    };
  });

  return rows
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exacts !== a.exacts) return b.exacts - a.exacts;
      return a.fullName.localeCompare(b.fullName, "es");
    })
    .map((row, index) => ({ position: index + 1, ...row }));
}

function participantDetails(state, participantId) {
  const fixturesById = new Map(state.fixtures.map((match) => [match.id, match]));
  const results = state.results || {};
  return state.predictions
    .filter((prediction) => prediction.participantId === participantId)
    .map((prediction) => ({
      ...prediction,
      match: fixturesById.get(prediction.matchId),
      result: results[prediction.matchId] || null,
      score: scorePrediction(prediction, results[prediction.matchId]),
    }));
}

async function api(req, res, url) {
  const fullState = await store.getState();
  const state = filterStateForVisibleFixtures(fullState);

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const deviceId = url.searchParams.get("deviceId");
    const participant = deviceId
      ? state.participants.find((item) => item.deviceId === deviceId)
      : null;
    return send(res, 200, {
      lockAt: state.lockAt,
      locked: isLocked(state),
      fixtures: state.fixtures,
      participant: participant || null,
      predictions: participant ? participantDetails(state, participant.id) : [],
      leaderboard: buildLeaderboard(state),
      storage: USE_SUPABASE ? "supabase" : "local",
      matchLimit: MATCH_LIMIT > 0 ? MATCH_LIMIT : null,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    if (isLocked(state)) {
      return send(res, 403, { error: "Las inscripciones ya estan bloqueadas." });
    }
    const body = await readBody(req);
    const deviceId = String(body.deviceId || "").trim();
    const nameValidation = validateFullName(body.fullName);
    if (!deviceId || !nameValidation.valid) {
      return send(res, 400, { error: nameValidation.error || "Falta nombre y apellido." });
    }

    const existingParticipant = state.participants.find((item) => item.deviceId === deviceId);
    if (existingParticipant) {
      return send(res, 200, { participant: existingParticipant });
    }

    const duplicate = state.participants.find(
      (item) => participantNameKey(item) === nameValidation.normalizedName,
    );
    if (duplicate) {
      return send(res, 409, { error: "Ese nombre ya esta registrado." });
    }

    const participant = {
      id: newId("p"),
      deviceId,
      fullName: nameValidation.fullName,
      normalizedName: nameValidation.normalizedName,
      createdAt: new Date().toISOString(),
      submittedAt: null,
    };

    try {
      const created = await store.createParticipant(fullState, participant);
      return send(res, 200, { participant: created });
    } catch (error) {
      if (error.status === 409) {
        return send(res, 409, { error: "Ese nombre ya esta registrado." });
      }
      throw error;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/predictions") {
    if (isLocked(state)) {
      return send(res, 403, { error: "El prode ya esta bloqueado." });
    }
    const body = await readBody(req);
    const participant = state.participants.find(
      (item) => item.deviceId === String(body.deviceId || ""),
    );
    if (!participant) return send(res, 404, { error: "Participante no encontrado." });
    if (participant.submittedAt) {
      return send(res, 409, { error: "Tus predicciones ya fueron enviadas." });
    }

    const fixtureIds = new Set(state.fixtures.map((match) => match.id));
    const predictions = Array.isArray(body.predictions) ? body.predictions : [];
    if (predictions.length !== state.fixtures.length) {
      return send(res, 400, { error: "Tenes que completar todos los partidos." });
    }

    const cleaned = predictions.map((prediction) => ({
      participantId: participant.id,
      matchId: String(prediction.matchId),
      homeGoals: Number(prediction.homeGoals),
      awayGoals: Number(prediction.awayGoals),
    }));

    const invalid = cleaned.some(
      (prediction) =>
        !fixtureIds.has(prediction.matchId) ||
        !Number.isInteger(prediction.homeGoals) ||
        !Number.isInteger(prediction.awayGoals) ||
        prediction.homeGoals < 0 ||
        prediction.awayGoals < 0 ||
        prediction.homeGoals > 30 ||
        prediction.awayGoals > 30,
    );
    if (invalid) return send(res, 400, { error: "Hay predicciones invalidas." });

    const fullStateParticipant = fullState.participants.find((item) => item.id === participant.id);
    const updatedParticipant = await store.submitPredictions(
      fullState,
      fullStateParticipant || participant,
      cleaned,
    );
    const updatedState = filterStateForVisibleFixtures(await store.getState());
    return send(res, 200, {
      participant: updatedParticipant,
      predictions: participantDetails(updatedState, participant.id),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admin") {
    if (!requireAdmin(url)) return send(res, 401, { error: "Admin key invalida." });
    return send(res, 200, {
      lockAt: state.lockAt,
      locked: isLocked(state),
      fixtures: state.fixtures,
      participants: state.participants,
      results: state.results,
      leaderboard: buildLeaderboard(state),
      predictionCount: state.predictions.length,
      storage: USE_SUPABASE ? "supabase" : "local",
      matchLimit: MATCH_LIMIT > 0 ? MATCH_LIMIT : null,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/results") {
    if (!requireAdmin(url)) return send(res, 401, { error: "Admin key invalida." });
    const body = await readBody(req);
    const match = state.fixtures.find((item) => item.id === String(body.matchId || ""));
    if (!match) return send(res, 404, { error: "Partido no encontrado." });
    const clear = body.clear === true;
    if (clear) {
      await store.clearResult(fullState, match.id);
    } else {
      const homeGoals = Number(body.homeGoals);
      const awayGoals = Number(body.awayGoals);
      if (
        !Number.isInteger(homeGoals) ||
        !Number.isInteger(awayGoals) ||
        homeGoals < 0 ||
        awayGoals < 0 ||
        homeGoals > 30 ||
        awayGoals > 30
      ) {
        return send(res, 400, { error: "Resultado invalido." });
      }
      await store.setResult(fullState, match.id, {
        homeGoals,
        awayGoals,
        updatedAt: new Date().toISOString(),
      });
    }
    const updatedState = filterStateForVisibleFixtures(await store.getState());
    return send(res, 200, {
      results: updatedState.results,
      leaderboard: buildLeaderboard(updatedState),
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/participants/")) {
    if (!requireAdmin(url)) return send(res, 401, { error: "Admin key invalida." });
    const participantId = decodeURIComponent(url.pathname.split("/").pop() || "");
    const participant = state.participants.find((item) => item.id === participantId);
    if (!participant) return send(res, 404, { error: "Participante no encontrado." });
    await store.deleteParticipant(fullState, participantId);
    const updatedState = filterStateForVisibleFixtures(await store.getState());
    return send(res, 200, {
      participants: updatedState.participants,
      leaderboard: buildLeaderboard(updatedState),
      predictionCount: updatedState.predictions.length,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/export.csv") {
    if (!requireAdmin(url)) return send(res, 401, "Admin key invalida.", "text/plain; charset=utf-8");
    const leaderboard = buildLeaderboard(state);
    const lines = [
      ["posicion", "nombre", "puntos", "exactos", "ganadores", "predicciones", "enviado"].join(","),
      ...leaderboard.map((row) =>
        [
          row.position,
          csv(row.fullName),
          row.points,
          row.exacts,
          row.winners,
          row.predictionsCount,
          row.submittedAt || "",
        ].join(","),
      ),
    ];
    return send(res, 200, `${lines.join("\n")}\n`, "text/csv; charset=utf-8");
  }

  return send(res, 404, { error: "Ruta no encontrada." });
}

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    const index = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": contentTypes[".html"], "Cache-Control": "no-store" });
    res.end(index);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await api(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    send(res, error.status || 500, { error: error.message || "Error interno" });
  }
});

ensureState().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Prode Mundial 2026 corriendo en http://localhost:${PORT}`);
    console.log(`Persistencia: ${USE_SUPABASE ? "Supabase" : "JSON local"}`);
    console.log(`Admin: http://localhost:${PORT}/admin?key=${ADMIN_KEY}`);
  });
});
