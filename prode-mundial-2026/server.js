import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const env = globalThis.process?.env || {};
const PORT = Number(env.PORT || 3000);
const ADMIN_KEY = env.ADMIN_KEY || "admin-2026";
const LOCK_AT = env.LOCK_AT || "2026-06-11T17:00:00-03:00";
const ACTIVE_PHASE = env.ACTIVE_PHASE || "round32";
const MATCH_LIMIT = Number(env.MATCH_LIMIT || 0);
const SUPABASE_URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const FIXTURES_FILE = path.join(DATA_DIR, "fixtures.json");
const ROUND32_FIXTURES_FILE = path.join(DATA_DIR, "round32-fixtures.json");

const PHASES = [
  { id: "group", label: "Fase de grupos", historical: true },
  { id: "round32", label: "Dieciseisavos", historical: false },
];

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

async function readOptionalJson(file, fallback) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeFixture(match, index, fallbackPhase = "group") {
  return {
    ...match,
    phase: match.phase || fallbackPhase,
    lockAt: match.lockAt || match.date,
    displayOrder: match.displayOrder || index + 1,
  };
}

async function readAllLocalFixtures() {
  const groupFixtures = (await readJson(FIXTURES_FILE)).map((match, index) =>
    normalizeFixture(match, index, "group"),
  );
  const round32Fixtures = (await readOptionalJson(ROUND32_FIXTURES_FILE, [])).map((match, index) =>
    normalizeFixture(match, groupFixtures.length + index, "round32"),
  );
  return [...groupFixtures, ...round32Fixtures];
}

async function readLocalState() {
  await ensureState();
  const state = await readJson(STATE_FILE);
  state.fixtures = await readAllLocalFixtures();
  state.predictions ||= [];
  state.results ||= {};
  state.participants ||= [];
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
    phase: row.phase || "group",
    group: row.group_name,
    matchday: row.matchday,
    date: row.match_date,
    lockAt: row.lock_at || row.match_date,
    venue: row.venue,
    home: row.home_team,
    away: row.away_team,
    displayOrder: row.display_order,
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

  async upsertPredictions(state, participant, predictions) {
    const ids = new Set(predictions.map((prediction) => prediction.matchId));
    state.predictions = state.predictions.filter(
      (prediction) => prediction.participantId !== participant.id || !ids.has(prediction.matchId),
    );
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

  async upsertPredictions(_state, participant, predictions) {
    if (!predictions.length) return participant;
    await supabaseRequest("predictions?on_conflict=participant_id,match_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: predictions.map((prediction) => ({
        participant_id: prediction.participantId,
        match_id: prediction.matchId,
        home_goals: prediction.homeGoals,
        away_goals: prediction.awayGoals,
      })),
    });
    return participant;
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

function phaseDefinition(phase) {
  return PHASES.find((item) => item.id === phase) || PHASES.find((item) => item.id === ACTIVE_PHASE) || PHASES[0];
}

function getRequestedPhase(url, body = null) {
  return phaseDefinition(body?.phase || url.searchParams.get("phase") || ACTIVE_PHASE).id;
}

function fixturePhase(match) {
  return match.phase || "group";
}

function isActivePhase(phase) {
  return phase === ACTIVE_PHASE;
}

function visibleFixtures(fixtures, phase) {
  const phaseFixtures = fixtures.filter((match) => fixturePhase(match) === phase);
  if (!isActivePhase(phase) || !Number.isInteger(MATCH_LIMIT) || MATCH_LIMIT <= 0) {
    return phaseFixtures;
  }
  return phaseFixtures.slice(0, MATCH_LIMIT);
}

function filterStateForPhase(state, phase) {
  const fixtures = visibleFixtures(state.fixtures, phase);
  const fixtureIds = new Set(fixtures.map((match) => match.id));
  return {
    ...state,
    phase,
    fixtures,
    predictions: state.predictions.filter((prediction) => fixtureIds.has(prediction.matchId)),
    results: Object.fromEntries(
      Object.entries(state.results || {}).filter(([matchId]) => fixtureIds.has(matchId)),
    ),
  };
}

function matchLockAt(match, phase) {
  if (phase === "group") return LOCK_AT;
  return match.lockAt || match.date;
}

function isMatchLocked(match, phase) {
  return Date.now() >= new Date(matchLockAt(match, phase)).getTime();
}

function isPhaseLocked(state, phase) {
  if (phase === "group") return true;
  return state.fixtures.length > 0 && state.fixtures.every((match) => isMatchLocked(match, phase));
}

function decorateFixturesForClient(fixtures, phase) {
  return fixtures.map((match) => ({
    ...match,
    lockAt: matchLockAt(match, phase),
    locked: isMatchLocked(match, phase),
  }));
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
    }))
    .filter((prediction) => prediction.match);
}

function findParticipantById(state, participantId) {
  return state.participants.find((participant) => participant.id === participantId) || null;
}

function findParticipantByName(state, normalizedName) {
  return state.participants.find((participant) => participantNameKey(participant) === normalizedName) || null;
}

function buildClientState(state, phase, participant = null) {
  return {
    phases: PHASES.map((item) => ({
      ...item,
      active: item.id === ACTIVE_PHASE,
      selected: item.id === phase,
    })),
    activePhase: ACTIVE_PHASE,
    phase,
    phaseLabel: phaseDefinition(phase).label,
    lockAt: state.lockAt,
    locked: isPhaseLocked(state, phase),
    fixtures: decorateFixturesForClient(state.fixtures, phase),
    participant: participant || null,
    predictions: participant ? participantDetails(state, participant.id) : [],
    leaderboard: buildLeaderboard(state),
    storage: USE_SUPABASE ? "supabase" : "local",
    matchLimit: isActivePhase(phase) && MATCH_LIMIT > 0 ? MATCH_LIMIT : null,
  };
}

function validateScorePair(homeGoals, awayGoals) {
  return (
    Number.isInteger(homeGoals) &&
    Number.isInteger(awayGoals) &&
    homeGoals >= 0 &&
    awayGoals >= 0 &&
    homeGoals <= 30 &&
    awayGoals <= 30
  );
}

async function api(req, res, url) {
  const fullState = await store.getState();
  const phase = getRequestedPhase(url);
  const state = filterStateForPhase(fullState, phase);

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const participantId = url.searchParams.get("participantId");
    const deviceId = url.searchParams.get("deviceId");
    const participant =
      (participantId && findParticipantById(state, participantId)) ||
      (deviceId && state.participants.find((item) => item.deviceId === deviceId)) ||
      null;
    return send(res, 200, buildClientState(state, phase, participant));
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const nameValidation = validateFullName(body.fullName);
    if (!nameValidation.valid) {
      return send(res, 400, { error: nameValidation.error || "Falta nombre y apellido." });
    }
    const participant = findParticipantByName(fullState, nameValidation.normalizedName);
    if (!participant) {
      return send(res, 404, { error: "No encontre un participante registrado con ese nombre." });
    }
    const phaseState = filterStateForPhase(fullState, getRequestedPhase(url, body));
    return send(res, 200, {
      participant,
      bootstrap: buildClientState(phaseState, phaseState.phase, participant),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    if (isPhaseLocked(state, "group")) {
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
    const body = await readBody(req);
    const requestedPhase = getRequestedPhase(url, body);
    const phaseState = filterStateForPhase(fullState, requestedPhase);
    if (!isActivePhase(requestedPhase) || requestedPhase === "group") {
      return send(res, 403, { error: "Esta etapa esta cerrada para nuevas predicciones." });
    }

    const participant = findParticipantById(fullState, String(body.participantId || ""));
    if (!participant) return send(res, 404, { error: "Participante no encontrado." });

    const fixtureIds = new Set(phaseState.fixtures.map((match) => match.id));
    const unlockedFixtures = phaseState.fixtures.filter((match) => !isMatchLocked(match, requestedPhase));
    if (!unlockedFixtures.length) {
      return send(res, 403, { error: "Todos los partidos visibles ya estan bloqueados." });
    }

    const incoming = Array.isArray(body.predictions) ? body.predictions : [];
    const cleaned = incoming.map((prediction) => ({
      participantId: participant.id,
      matchId: String(prediction.matchId),
      homeGoals: Number(prediction.homeGoals),
      awayGoals: Number(prediction.awayGoals),
    }));

    const invalid = cleaned.some(
      (prediction) =>
        !fixtureIds.has(prediction.matchId) ||
        !validateScorePair(prediction.homeGoals, prediction.awayGoals),
    );
    if (invalid) return send(res, 400, { error: "Hay predicciones invalidas." });

    const predictionsByMatch = new Map(cleaned.map((prediction) => [prediction.matchId, prediction]));
    const missingUnlocked = unlockedFixtures.some((match) => !predictionsByMatch.has(match.id));
    if (missingUnlocked) {
      return send(res, 400, { error: "Completa los partidos que todavia no empezaron." });
    }

    const existingPredictions = new Map(
      phaseState.predictions
        .filter((prediction) => prediction.participantId === participant.id)
        .map((prediction) => [prediction.matchId, prediction]),
    );
    const lockedChanged = phaseState.fixtures
      .filter((match) => isMatchLocked(match, requestedPhase))
      .some((match) => {
        const incomingPrediction = predictionsByMatch.get(match.id);
        if (!incomingPrediction) return false;
        const existing = existingPredictions.get(match.id);
        return (
          !existing ||
          existing.homeGoals !== incomingPrediction.homeGoals ||
          existing.awayGoals !== incomingPrediction.awayGoals
        );
      });
    if (lockedChanged) {
      return send(res, 403, { error: "No se pueden modificar partidos que ya empezaron." });
    }

    const unlockedIds = new Set(unlockedFixtures.map((match) => match.id));
    const toSave = cleaned.filter((prediction) => unlockedIds.has(prediction.matchId));
    await store.upsertPredictions(fullState, participant, toSave);
    const updatedFullState = await store.getState();
    const updatedState = filterStateForPhase(updatedFullState, requestedPhase);
    return send(res, 200, buildClientState(updatedState, requestedPhase, participant));
  }

  if (req.method === "GET" && url.pathname === "/api/admin") {
    if (!requireAdmin(url)) return send(res, 401, { error: "Admin key invalida." });
    return send(res, 200, {
      ...buildClientState(state, phase, null),
      participants: state.participants,
      results: state.results,
      predictionCount: state.predictions.length,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/results") {
    if (!requireAdmin(url)) return send(res, 401, { error: "Admin key invalida." });
    const body = await readBody(req);
    const requestedPhase = getRequestedPhase(url, body);
    const phaseState = filterStateForPhase(fullState, requestedPhase);
    const match = phaseState.fixtures.find((item) => item.id === String(body.matchId || ""));
    if (!match) return send(res, 404, { error: "Partido no encontrado." });
    const clear = body.clear === true;
    if (clear) {
      await store.clearResult(fullState, match.id);
    } else {
      const homeGoals = Number(body.homeGoals);
      const awayGoals = Number(body.awayGoals);
      if (!validateScorePair(homeGoals, awayGoals)) {
        return send(res, 400, { error: "Resultado invalido." });
      }
      await store.setResult(fullState, match.id, {
        homeGoals,
        awayGoals,
        updatedAt: new Date().toISOString(),
      });
    }
    const updatedState = filterStateForPhase(await store.getState(), requestedPhase);
    return send(res, 200, {
      ...buildClientState(updatedState, requestedPhase, null),
      participants: updatedState.participants,
      results: updatedState.results,
      predictionCount: updatedState.predictions.length,
    });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/participants/")) {
    if (!requireAdmin(url)) return send(res, 401, { error: "Admin key invalida." });
    const participantId = decodeURIComponent(url.pathname.split("/").pop() || "");
    const participant = fullState.participants.find((item) => item.id === participantId);
    if (!participant) return send(res, 404, { error: "Participante no encontrado." });
    await store.deleteParticipant(fullState, participantId);
    const updatedState = filterStateForPhase(await store.getState(), phase);
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
      ["etapa", "posicion", "nombre", "puntos", "exactos", "ganadores", "predicciones"].join(","),
      ...leaderboard.map((row) =>
        [
          csv(phaseDefinition(phase).label),
          row.position,
          csv(row.fullName),
          row.points,
          row.exacts,
          row.winners,
          row.predictionsCount,
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
    console.log(`Etapa activa: ${ACTIVE_PHASE}`);
    console.log(`Admin: http://localhost:${PORT}/admin?key=${ADMIN_KEY}`);
  });
});
