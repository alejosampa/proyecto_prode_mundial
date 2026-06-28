const app = document.querySelector("#app");
const participantKey = "prode-2026-participant-id";
const selectedPhaseKey = "prode-2026-selected-phase";
const activeDefaultPhase = "round32";
const adminRoute = window.location.pathname.startsWith("/admin");
const tableRoute = window.location.pathname.startsWith("/tabla");
let bootstrap = null;
let adminState = null;
let saveTimer = null;

const teamFlags = {
  Alemania: "\u{1F1E9}\u{1F1EA}",
  "Arabia Saudita": "\u{1F1F8}\u{1F1E6}",
  Argelia: "\u{1F1E9}\u{1F1FF}",
  Argentina: "\u{1F1E6}\u{1F1F7}",
  Australia: "\u{1F1E6}\u{1F1FA}",
  Austria: "\u{1F1E6}\u{1F1F9}",
  Bosnia: "\u{1F1E7}\u{1F1E6}",
  Brasil: "\u{1F1E7}\u{1F1F7}",
  Belgica: "\u{1F1E7}\u{1F1EA}",
  "BÃ©lgica": "\u{1F1E7}\u{1F1EA}",
  "Cabo Verde": "\u{1F1E8}\u{1F1FB}",
  Canada: "\u{1F1E8}\u{1F1E6}",
  Colombia: "\u{1F1E8}\u{1F1F4}",
  "Corea del sur": "\u{1F1F0}\u{1F1F7}",
  "Costa de Marfil": "\u{1F1E8}\u{1F1EE}",
  Croacia: "\u{1F1ED}\u{1F1F7}",
  Curazao: "\u{1F1E8}\u{1F1FC}",
  "DR Congo": "\u{1F1E8}\u{1F1E9}",
  Ecuador: "\u{1F1EA}\u{1F1E8}",
  Egipto: "\u{1F1EA}\u{1F1EC}",
  Escocia: "\u{1F3F4}",
  Espana: "\u{1F1EA}\u{1F1F8}",
  "EspaÃ±a": "\u{1F1EA}\u{1F1F8}",
  Francia: "\u{1F1EB}\u{1F1F7}",
  Ghana: "\u{1F1EC}\u{1F1ED}",
  Haiti: "\u{1F1ED}\u{1F1F9}",
  Holanda: "\u{1F1F3}\u{1F1F1}",
  Inglaterra: "\u{1F3F4}",
  Iran: "\u{1F1EE}\u{1F1F7}",
  Iraq: "\u{1F1EE}\u{1F1F6}",
  Japon: "\u{1F1EF}\u{1F1F5}",
  "JapÃ³n": "\u{1F1EF}\u{1F1F5}",
  Jordania: "\u{1F1EF}\u{1F1F4}",
  Marruecos: "\u{1F1F2}\u{1F1E6}",
  Mexico: "\u{1F1F2}\u{1F1FD}",
  Noruega: "\u{1F1F3}\u{1F1F4}",
  "Nueva Zelanda": "\u{1F1F3}\u{1F1FF}",
  Panama: "\u{1F1F5}\u{1F1E6}",
  Paraguay: "\u{1F1F5}\u{1F1FE}",
  Portugal: "\u{1F1F5}\u{1F1F9}",
  Qatar: "\u{1F1F6}\u{1F1E6}",
  "Republica Checa": "\u{1F1E8}\u{1F1FF}",
  Senegal: "\u{1F1F8}\u{1F1F3}",
  Sudafrica: "\u{1F1FF}\u{1F1E6}",
  Suecia: "\u{1F1F8}\u{1F1EA}",
  Suiza: "\u{1F1E8}\u{1F1ED}",
  Tunez: "\u{1F1F9}\u{1F1F3}",
  Turquia: "\u{1F1F9}\u{1F1F7}",
  USA: "\u{1F1FA}\u{1F1F8}",
  Uruguay: "\u{1F1FA}\u{1F1FE}",
  Uzbekistan: "\u{1F1FA}\u{1F1FF}",
};

function html(strings, ...values) {
  return strings.map((chunk, index) => `${chunk}${values[index] ?? ""}`).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function teamLabel(team) {
  const flag = teamFlags[team];
  return `${flag ? `<span class="flag" aria-hidden="true">${flag}</span>` : ""}<span>${escapeHtml(team)}</span>`;
}

function hasArgentina(match) {
  return match.home === "Argentina" || match.away === "Argentina";
}

function cleanDisplayName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateFullName(value) {
  const fullName = cleanDisplayName(value);
  const parts = fullName.split(" ").filter(Boolean);
  const validNamePart = /^\p{L}+(?:['-]\p{L}+)*$/u;

  if (parts.length < 2) return { valid: false, error: "Ingresa nombre y apellido." };
  if (!parts.every((part) => validNamePart.test(part))) {
    return { valid: false, error: "El nombre solo puede tener letras, espacios, guiones o apostrofes." };
  }
  return { valid: true, fullName };
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}

function api(path, options = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }).then(async (response) => {
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) throw new Error(body.error || body || "Error inesperado");
    return body;
  });
}

function getParticipantId() {
  return localStorage.getItem(participantKey) || "";
}

function setParticipant(participant) {
  localStorage.setItem(participantKey, participant.id);
}

function clearParticipant() {
  localStorage.removeItem(participantKey);
  bootstrap = { ...bootstrap, participant: null, predictions: [] };
}

function getSelectedPhase() {
  return localStorage.getItem(selectedPhaseKey) || activeDefaultPhase;
}

function setSelectedPhase(phase) {
  localStorage.setItem(selectedPhaseKey, phase);
}

function setActiveNav() {
  document.querySelectorAll("[data-nav]").forEach((item) => {
    const key = item.dataset.nav;
    item.classList.toggle(
      "active",
      (adminRoute && key === "admin") ||
        (tableRoute && key === "tabla") ||
        (!adminRoute && !tableRoute && key === "home"),
    );
  });
}

async function loadBootstrap(phase = getSelectedPhase()) {
  const params = new URLSearchParams({ phase });
  const participantId = getParticipantId();
  if (participantId) params.set("participantId", participantId);
  bootstrap = await api(`/api/bootstrap?${params.toString()}`);
  if (!bootstrap.phases.some((item) => item.id === phase)) {
    setSelectedPhase(bootstrap.activePhase);
  }
}

function groupFixtures(fixtures) {
  return fixtures.reduce((acc, match) => {
    const key = match.phase === "group" ? `Grupo ${match.group}` : match.group;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});
}

function phaseTabs(state, compact = false) {
  return html`
    <div class="phase-tabs" role="tablist" aria-label="Etapas">
      ${state.phases
        .map(
          (phase) => html`
            <button
              class="phase-tab ${phase.selected ? "active" : ""}"
              type="button"
              data-phase="${phase.id}"
              role="tab"
              aria-selected="${phase.selected ? "true" : "false"}"
            >
              <span>${escapeHtml(phase.label)}</span>
              ${phase.active && !compact ? `<small>Activa</small>` : ""}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function bindPhaseTabs(afterSwitch) {
  document.querySelectorAll("[data-phase]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const phase = event.currentTarget.dataset.phase;
      setSelectedPhase(phase);
      await loadBootstrap(phase);
      afterSwitch();
    });
  });
}

function renderPublic() {
  if (tableRoute) {
    renderLeaderboardPage();
    return;
  }

  if (!bootstrap.participant) {
    renderLogin();
    return;
  }

  if (bootstrap.phase === "group") {
    renderSubmitted();
    return;
  }

  renderPredictionForm();
}

function renderLogin() {
  app.innerHTML = html`
    <section class="grid">
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>Entrar al prode</h2>
            <p>Usa el mismo nombre y apellido con el que jugaste la fase de grupos.</p>
          </div>
        </div>
        ${phaseTabs(bootstrap)}
        <form id="login-form">
          <div class="field">
            <label for="fullName">Nombre y apellido</label>
            <input id="fullName" name="fullName" autocomplete="name" autocapitalize="words" required maxlength="80" />
          </div>
          <button class="btn" type="submit">Entrar</button>
        </form>
      </div>
      ${leaderboardAside()}
    </section>
  `;

  bindPhaseTabs(renderPublic);
  document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameValidation = validateFullName(new FormData(event.currentTarget).get("fullName"));
    if (!nameValidation.valid) {
      showToast(nameValidation.error, "error");
      return;
    }
    await withButton(event.submitter, async () => {
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ fullName: nameValidation.fullName, phase: bootstrap.phase }),
      });
      setParticipant(result.participant);
      bootstrap = result.bootstrap;
      renderPublic();
    });
  });
}

function renderPredictionForm() {
  const groups = groupFixtures(bootstrap.fixtures);
  const openMatches = bootstrap.fixtures.filter((match) => !match.locked).length;
  app.innerHTML = html`
    <section class="panel">
      <div class="section-head">
        <div>
          <h2>${escapeHtml(bootstrap.participant.fullName)}</h2>
          <p>Dieciseisavos se guarda partido por partido hasta la hora de inicio en Argentina.</p>
        </div>
        <div class="actions">
          <span class="badge">${openMatches} abiertos</span>
          <button class="btn secondary" type="button" id="switch-user">Cambiar</button>
        </div>
      </div>
      ${phaseTabs(bootstrap)}
      ${bootstrap.matchLimit ? `<div class="notice">Prueba activa: se muestran ${bootstrap.matchLimit} partidos.</div>` : ""}
      <form id="predictions-form">
        <div class="groups">
          ${Object.entries(groups)
            .map(
              ([group, matches]) => html`
                <section class="group-block">
                  <div class="group-title">
                    <span>${escapeHtml(group)}</span>
                    <span>${matches.length} partidos</span>
                  </div>
                  ${matches.map((match) => predictionRow(match)).join("")}
                </section>
              `,
            )
            .join("")}
        </div>
        <div class="toolbar">
          <span id="progress" class="progress"></span>
          <div class="actions">
            <button class="btn secondary" type="button" id="save-draft">Guardar borrador</button>
            <button class="btn" type="submit" ${openMatches ? "" : "disabled"}>Guardar prode</button>
          </div>
        </div>
      </form>
    </section>
  `;
  bindPhaseTabs(renderPublic);
  bindSwitchUser();
  bindPredictionForm();
}

function predictionValue(match) {
  const saved = bootstrap.predictions.find((prediction) => prediction.matchId === match.id);
  const draft = readDraft()[match.id];
  return saved || draft || null;
}

function predictionRow(match) {
  const value = predictionValue(match);
  const locked = match.locked;
  return html`
    <article class="match-row ${hasArgentina(match) ? "argentina-match" : ""} ${locked ? "locked-match" : ""}">
      <div class="match-meta">
        <strong>${formatDate(match.date)}</strong><br />
        ${escapeHtml(match.venue)}
        ${locked ? `<span class="lock-label">Bloqueado</span>` : ""}
      </div>
      <div class="match-teams">
        <span class="team">${teamLabel(match.home)}</span>
        <input
          class="score-input"
          type="number"
          min="0"
          max="30"
          inputmode="numeric"
          aria-label="Goles ${escapeHtml(match.home)}"
          data-home="${match.id}"
          value="${value?.homeGoals ?? ""}"
          ${locked ? "disabled" : "required"}
        />
        <span class="dash">-</span>
        <input
          class="score-input"
          type="number"
          min="0"
          max="30"
          inputmode="numeric"
          aria-label="Goles ${escapeHtml(match.away)}"
          data-away="${match.id}"
          value="${value?.awayGoals ?? ""}"
          ${locked ? "disabled" : "required"}
        />
        <span class="team away">${teamLabel(match.away)}</span>
      </div>
    </article>
  `;
}

function bindPredictionForm() {
  const form = document.querySelector("#predictions-form");
  const updateProgress = () => {
    const openMatches = bootstrap.fixtures.filter((match) => !match.locked);
    const completed = collectPredictions(false).filter(
      (item) => item.homeGoals !== "" && item.awayGoals !== "" && !item.locked,
    ).length;
    document.querySelector("#progress").textContent = `${completed}/${openMatches.length} abiertos completos`;
  };

  form.addEventListener("input", () => {
    updateProgress();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeDraftFromForm, 350);
  });
  document.querySelector("#save-draft").addEventListener("click", writeDraftFromForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const predictions = collectPredictions(true);
    if (!predictions.length) return;
    await withButton(event.submitter, async () => {
      bootstrap = await api("/api/predictions", {
        method: "POST",
        body: JSON.stringify({
          participantId: bootstrap.participant.id,
          phase: bootstrap.phase,
          predictions,
        }),
      });
      localStorage.removeItem(draftKey());
      showToast("Predicciones guardadas.", "ok");
      renderPredictionForm();
    });
  });
  updateProgress();
}

function collectPredictions(validate) {
  const values = bootstrap.fixtures.map((match) => {
    const home = document.querySelector(`[data-home="${match.id}"]`).value;
    const away = document.querySelector(`[data-away="${match.id}"]`).value;
    return {
      matchId: match.id,
      homeGoals: home === "" ? "" : Number(home),
      awayGoals: away === "" ? "" : Number(away),
      locked: match.locked,
    };
  });

  if (validate) {
    const invalid = values.some(
      (item) =>
        !item.locked &&
        (item.homeGoals === "" ||
          item.awayGoals === "" ||
          !Number.isInteger(item.homeGoals) ||
          !Number.isInteger(item.awayGoals) ||
          item.homeGoals < 0 ||
          item.awayGoals < 0),
    );
    if (invalid) {
      showToast("Completa los partidos abiertos con numeros validos.", "error");
      return [];
    }
  }

  if (!validate) return values;
  return values.filter((item) => !item.locked).map(({ locked, ...prediction }) => prediction);
}

function draftKey() {
  return `prode-2026-draft-${bootstrap.participant?.id || "anon"}-${bootstrap.phase}`;
}

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey()) || "{}");
  } catch {
    return {};
  }
}

function writeDraftFromForm() {
  const draft = collectPredictions(false).reduce((acc, item) => {
    if (item.homeGoals !== "" || item.awayGoals !== "") acc[item.matchId] = item;
    return acc;
  }, {});
  localStorage.setItem(draftKey(), JSON.stringify(draft));
  showToast("Borrador guardado en este dispositivo.", "ok");
}

function bindSwitchUser() {
  document.querySelector("#switch-user")?.addEventListener("click", () => {
    clearParticipant();
    renderLogin();
  });
}

function renderSubmitted() {
  const totals = bootstrap.leaderboard.find(
    (row) => row.participantId === bootstrap.participant.id,
  ) || { points: 0, exacts: 0, winners: 0, position: "-" };
  const title = bootstrap.phase === "group" ? "Fase de grupos" : "Tus predicciones";

  app.innerHTML = html`
    <section class="grid">
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>${title}</h2>
            <p>${escapeHtml(bootstrap.participant.fullName)} · ${escapeHtml(bootstrap.phaseLabel)}</p>
          </div>
          <div class="actions">
            <span class="badge">Puesto ${totals.position}</span>
            <button class="btn secondary" type="button" id="switch-user">Cambiar</button>
          </div>
        </div>
        ${phaseTabs(bootstrap)}
        <div class="summary">
          <div class="stat"><b>${totals.points}</b><span>Puntos</span></div>
          <div class="stat"><b>${totals.exacts}</b><span>Exactos</span></div>
          <div class="stat"><b>${totals.winners}</b><span>Ganadores</span></div>
        </div>
        <div class="submitted-list">
          ${bootstrap.predictions.length
            ? bootstrap.predictions.map(submittedRow).join("")
            : `<div class="notice">Todavia no hay predicciones cargadas para esta etapa.</div>`}
        </div>
      </div>
      ${leaderboardAside()}
    </section>
  `;
  bindPhaseTabs(renderPublic);
  bindSwitchUser();
}

function submittedRow(item) {
  const result = item.result
    ? `${item.result.homeGoals}-${item.result.awayGoals}`
    : "Pendiente";
  return html`
    <article class="submitted-match ${hasArgentina(item.match) ? "argentina-match" : ""}">
      <div>
        <strong>${teamLabel(item.match.home)} ${item.homeGoals}-${item.awayGoals} ${teamLabel(item.match.away)}</strong>
        <div class="muted">${formatDate(item.match.date)} · Real: ${result}</div>
      </div>
      <span class="badge ${item.score.status}">${scoreLabel(item.score)}</span>
    </article>
  `;
}

function scoreLabel(score) {
  if (score.status === "pending") return "Sin jugar";
  if (score.status === "exact") return "+4 exacto";
  if (score.status === "winner") return "+2 ganador";
  return "0 pts";
}

function renderLeaderboardPage() {
  app.innerHTML = html`
    <section class="panel">
      <div class="section-head">
        <div>
          <h2>Tabla de posiciones</h2>
          <p>${escapeHtml(bootstrap.phaseLabel)} · ordenada por puntos y despues por resultados exactos.</p>
          <p>R.E = Resultados exactos (4pts) · R.G = Ganadores (2pts)</p>
        </div>
        <button class="btn secondary" id="refresh-table" type="button">Actualizar</button>
      </div>
      ${phaseTabs(bootstrap)}
      ${leaderboardTable(bootstrap.leaderboard)}
    </section>
  `;
  bindPhaseTabs(renderLeaderboardPage);
  document.querySelector("#refresh-table").addEventListener("click", async () => {
    await loadBootstrap();
    renderLeaderboardPage();
  });
}

function leaderboardAside() {
  return html`
    <aside class="panel compact-panel">
      <div class="section-head">
        <div>
          <h2>Tabla</h2>
          <p>${escapeHtml(bootstrap.phaseLabel)} · ${bootstrap.leaderboard.length} participantes</p>
        </div>
      </div>
      ${leaderboardTable(bootstrap.leaderboard.slice(0, 10), true)}
      <a class="btn secondary" href="/tabla">Ver tabla completa</a>
    </aside>
  `;
}

function leaderboardTable(rows, compact = false) {
  if (!rows.length) return `<div class="notice">Todavia no hay participantes para mostrar.</div>`;
  return html`
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pos</th>
            <th>Participantes</th>
            <th class="number">Pts</th>
            <th class="number ${compact ? "optional" : ""}">R.E</th>
            <th class="number ${compact ? "optional" : ""}">R.G</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => html`
                <tr>
                  <td><span class="rank">${row.position}</span></td>
                  <td>${escapeHtml(row.fullName)}</td>
                  <td class="number"><strong>${row.points}</strong></td>
                  <td class="number ${compact ? "optional" : ""}">${row.exacts}</td>
                  <td class="number ${compact ? "optional" : ""}">${row.winners}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderAdmin() {
  const key = new URLSearchParams(window.location.search).get("key") || "";
  if (!key) {
    app.innerHTML = html`
      <section class="panel">
        <h2>Panel admin</h2>
        <form id="admin-key-form" class="actions">
          <input name="key" placeholder="Clave admin" required />
          <button class="btn" type="submit">Entrar</button>
        </form>
      </section>
    `;
    document.querySelector("#admin-key-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const formKey = new FormData(event.currentTarget).get("key");
      window.location.href = `/admin?key=${encodeURIComponent(formKey)}`;
    });
    return;
  }

  try {
    const phase = getSelectedPhase();
    adminState = await api(`/api/admin?key=${encodeURIComponent(key)}&phase=${encodeURIComponent(phase)}`);
  } catch (error) {
    app.innerHTML = `<section class="panel"><div class="notice error">${escapeHtml(error.message)}</div></section>`;
    return;
  }

  app.innerHTML = html`
    <section class="grid">
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>Cargar resultados</h2>
            <p>${escapeHtml(adminState.phaseLabel)} · ${adminState.participants.length} participantes · ${adminState.predictionCount} predicciones · ${adminState.storage}</p>
          </div>
          <a class="btn secondary" href="/api/admin/export.csv?key=${encodeURIComponent(key)}&phase=${encodeURIComponent(adminState.phase)}">Exportar CSV</a>
        </div>
        ${phaseTabs(adminState)}
        <div class="admin-list">
          ${adminState.fixtures.map((match) => adminMatchRow(match, adminState.results[match.id])).join("")}
        </div>
      </div>
      <aside class="panel compact-panel">
        <div class="section-head">
          <div>
            <h2>Tabla actual</h2>
            <p>Se recalcula al guardar cada resultado.</p>
          </div>
        </div>
        ${leaderboardTable(adminState.leaderboard, true)}
        ${adminParticipantsList(adminState.participants)}
      </aside>
    </section>
  `;
  bindPhaseTabs(renderAdmin);
  bindAdmin(key);
}

function adminParticipantsList(participants) {
  if (!participants.length) return `<div class="notice">No hay participantes registrados.</div>`;

  return html`
    <div class="admin-participants">
      <h3>Participantes</h3>
      ${participants
        .map(
          (participant) => html`
            <article class="participant-admin-row">
              <div>
                <strong>${escapeHtml(participant.fullName)}</strong>
                <small>Registrado</small>
              </div>
              <button class="btn danger" type="button" data-delete-participant="${participant.id}">Borrar</button>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function adminMatchRow(match, result) {
  return html`
    <article class="admin-match ${hasArgentina(match) ? "argentina-match" : ""}" data-admin-match="${match.id}">
      <div>
        <strong>${teamLabel(match.home)} vs ${teamLabel(match.away)}</strong>
        <small>${escapeHtml(adminState.phaseLabel)} · ${formatDate(match.date)} · ${escapeHtml(match.venue)}</small>
      </div>
      <input class="score-input" type="number" min="0" max="30" inputmode="numeric" data-admin-home value="${result?.homeGoals ?? ""}" aria-label="Goles local" />
      <span class="dash">-</span>
      <input class="score-input" type="number" min="0" max="30" inputmode="numeric" data-admin-away value="${result?.awayGoals ?? ""}" aria-label="Goles visitante" />
      <div class="actions">
        <button class="btn" type="button" data-save-result>Guardar</button>
        <button class="btn secondary" type="button" data-clear-result>Limpiar</button>
      </div>
    </article>
  `;
}

function bindAdmin(key) {
  document.querySelectorAll("[data-admin-match]").forEach((row) => {
    row.querySelector("[data-save-result]").addEventListener("click", async (event) => {
      const matchId = row.dataset.adminMatch;
      const homeGoals = Number(row.querySelector("[data-admin-home]").value);
      const awayGoals = Number(row.querySelector("[data-admin-away]").value);
      await withButton(event.currentTarget, async () => {
        adminState = await api(`/api/admin/results?key=${encodeURIComponent(key)}`, {
          method: "POST",
          body: JSON.stringify({ matchId, homeGoals, awayGoals, phase: adminState.phase }),
        });
        showToast("Resultado guardado.", "ok");
        await renderAdmin();
      });
    });
    row.querySelector("[data-clear-result]").addEventListener("click", async (event) => {
      const matchId = row.dataset.adminMatch;
      await withButton(event.currentTarget, async () => {
        await api(`/api/admin/results?key=${encodeURIComponent(key)}`, {
          method: "POST",
          body: JSON.stringify({ matchId, clear: true, phase: adminState.phase }),
        });
        showToast("Resultado limpiado.", "ok");
        await renderAdmin();
      });
    });
  });

  document.querySelectorAll("[data-delete-participant]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const participantId = event.currentTarget.dataset.deleteParticipant;
      const confirmed = window.confirm(
        "Vas a borrar este participante y sus predicciones de todas las etapas. Confirmas?",
      );
      if (!confirmed) return;

      await withButton(event.currentTarget, async () => {
        await api(`/api/admin/participants/${encodeURIComponent(participantId)}?key=${encodeURIComponent(key)}`, {
          method: "DELETE",
        });
        showToast("Participante borrado.", "ok");
        await renderAdmin();
      });
    });
  });
}

async function withButton(button, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Procesando...";
  try {
    await task();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function showToast(message, kind = "ok") {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const toast = document.createElement("div");
  toast.className = `notice ${kind} toast`;
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.right = "16px";
  toast.style.bottom = "16px";
  toast.style.zIndex = "30";
  toast.style.maxWidth = "360px";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
}

async function refreshLoop() {
  if (adminRoute) return;
  try {
    await loadBootstrap();
    if (tableRoute || bootstrap.participant) renderPublic();
  } catch {
    // The manual refresh path will surface network errors.
  }
}

async function init() {
  setActiveNav();
  if (adminRoute) {
    await renderAdmin();
  } else {
    await loadBootstrap();
    renderPublic();
    setInterval(refreshLoop, 15000);
  }
}

init().catch((error) => {
  app.innerHTML = `<section class="panel"><div class="notice error">${escapeHtml(error.message)}</div></section>`;
});
