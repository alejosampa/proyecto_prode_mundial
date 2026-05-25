const app = document.querySelector("#app");
const deviceKey = "prode-2026-device-id";
const adminRoute = window.location.pathname.startsWith("/admin");
const tableRoute = window.location.pathname.startsWith("/tabla");
let bootstrap = null;
let adminState = null;
let saveTimer = null;

const teamFlags = {
  Alemania: "🇩🇪",
  "Arabia Saudita": "🇸🇦",
  Argelia: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Bosnia: "🇧🇦",
  Brasil: "🇧🇷",
  Bélgica: "🇧🇪",
  "Cabo Verde": "🇨🇻",
  Canada: "🇨🇦",
  Colombia: "🇨🇴",
  "Corea del sur": "🇰🇷",
  "Costa de Marfil": "🇨🇮",
  Croacia: "🇭🇷",
  Curazao: "🇨🇼",
  "DR Congo": "🇨🇩",
  Ecuador: "🇪🇨",
  Egipto: "🇪🇬",
  Escocia: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  España: "🇪🇸",
  Francia: "🇫🇷",
  Ghana: "🇬🇭",
  Haiti: "🇭🇹",
  Holanda: "🇳🇱",
  Inglaterra: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Iran: "🇮🇷",
  Iraq: "🇮🇶",
  Japón: "🇯🇵",
  Jordania: "🇯🇴",
  Marruecos: "🇲🇦",
  Mexico: "🇲🇽",
  Noruega: "🇳🇴",
  "Nueva Zelanda": "🇳🇿",
  Panama: "🇵🇦",
  Paraguay: "🇵🇾",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  "Republica Checa": "🇨🇿",
  Senegal: "🇸🇳",
  Sudafrica: "🇿🇦",
  Suecia: "🇸🇪",
  Suiza: "🇨🇭",
  Tunez: "🇹🇳",
  Turquia: "🇹🇷",
  USA: "🇺🇸",
  Uruguay: "🇺🇾",
  Uzbekistan: "🇺🇿",
};

function getDeviceId() {
  let id = localStorage.getItem(deviceKey);
  if (!id) {
    const randomPart =
      window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    id = `device_${randomPart}`;
    localStorage.setItem(deviceKey, id);
  }
  return id;
}

function html(strings, ...values) {
  return strings
    .map((chunk, index) => `${chunk}${values[index] ?? ""}`)
    .join("");
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

  if (parts.length < 2) {
    return { valid: false, error: "Ingresa nombre y apellido." };
  }

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

async function loadBootstrap() {
  bootstrap = await api(`/api/bootstrap?deviceId=${encodeURIComponent(getDeviceId())}`);
}

function groupFixtures(fixtures) {
  return fixtures.reduce((acc, match) => {
    const key = `Grupo ${match.group}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});
}

function renderPublic() {
  const participant = bootstrap.participant;
  if (tableRoute) {
    renderLeaderboardPage();
    return;
  }

  if (!participant) {
    renderRegister();
    return;
  }

  if (participant.submittedAt) {
    renderSubmitted();
    return;
  }

  renderPredictionForm();
}

function renderRegister() {
  app.innerHTML = html`
    <section class="grid">
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>Ingresar participante</h2>
            <p>Una vez que envies tus predicciones, quedan cerradas para este dispositivo.</p>
          </div>
        </div>
        ${bootstrap.locked
          ? `<div class="notice error">El prode ya esta bloqueado desde el inicio del Mundial.</div>`
          : ""}
        <form id="register-form">
          <div class="field">
            <label for="fullName">Nombre y apellido</label>
            <input id="fullName" name="fullName" autocomplete="name" autocapitalize="words" required maxlength="80" />
          </div>
          <button class="btn" type="submit" ${bootstrap.locked ? "disabled" : ""}>Entrar</button>
        </form>
      </div>
      ${leaderboardAside()}
    </section>
  `;

  document.querySelector("#register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameValidation = validateFullName(new FormData(event.currentTarget).get("fullName"));
    if (!nameValidation.valid) {
      showToast(nameValidation.error, "error");
      return;
    }
    await withButton(event.submitter, async () => {
      const result = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ deviceId: getDeviceId(), fullName: nameValidation.fullName }),
      });
      bootstrap.participant = result.participant;
      renderPredictionForm();
    });
  });
}

function renderPredictionForm() {
  const draft = readDraft();
  const groups = groupFixtures(bootstrap.fixtures);
  app.innerHTML = html`
    <section class="panel">
      <div class="section-head">
        <div>
          <h2>${escapeHtml(bootstrap.participant.fullName)}</h2>
          <p>Completa todos los resultados de fase de grupos. Bloqueo general: ${formatDate(bootstrap.lockAt)}</p>
        </div>
        <span class="badge">${bootstrap.fixtures.length} partidos</span>
      </div>
      ${bootstrap.locked ? `<div class="notice error">El prode ya esta bloqueado.</div>` : ""}
      <form id="predictions-form">
        <div class="groups">
          ${Object.entries(groups)
            .map(
              ([group, matches]) => html`
                <section class="group-block">
                  <div class="group-title">
                    <span>${group}</span>
                    <span>${matches.length} partidos</span>
                  </div>
                  ${matches
                    .map((match) => predictionRow(match, draft[match.id]))
                    .join("")}
                </section>
              `,
            )
            .join("")}
        </div>
        <div class="toolbar">
          <span id="progress" class="progress"></span>
          <div class="actions">
            <button class="btn secondary" type="button" id="save-draft">Guardar borrador</button>
            <button class="btn" type="submit" ${bootstrap.locked ? "disabled" : ""}>Enviar prode</button>
          </div>
        </div>
      </form>
    </section>
  `;
  bindPredictionForm();
}

function predictionRow(match, draftValue) {
  return html`
    <article class="match-row ${hasArgentina(match) ? "argentina-match" : ""}">
      <div class="match-meta">
        <strong>${formatDate(match.date)}</strong><br />
        ${escapeHtml(match.venue)}
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
          value="${draftValue?.homeGoals ?? ""}"
          required
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
          value="${draftValue?.awayGoals ?? ""}"
          required
        />
        <span class="team away">${teamLabel(match.away)}</span>
      </div>
    </article>
  `;
}

function bindPredictionForm() {
  const form = document.querySelector("#predictions-form");
  const updateProgress = () => {
    const completed = collectPredictions(false).filter(
      (item) => item.homeGoals !== "" && item.awayGoals !== "",
    ).length;
    document.querySelector("#progress").textContent = `${completed}/${bootstrap.fixtures.length} completos`;
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
    if (predictions.length !== bootstrap.fixtures.length) return;
    const confirmed = window.confirm(
      "Cuando envies el prode no vas a poder modificarlo. Confirmas el envio?",
    );
    if (!confirmed) return;
    await withButton(event.submitter, async () => {
      const result = await api("/api/predictions", {
        method: "POST",
        body: JSON.stringify({ deviceId: getDeviceId(), predictions }),
      });
      localStorage.removeItem(draftKey());
      bootstrap.participant = result.participant;
      bootstrap.predictions = result.predictions;
      renderSubmitted();
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
    };
  });

  if (validate) {
    const invalid = values.some(
      (item) =>
        item.homeGoals === "" ||
        item.awayGoals === "" ||
        !Number.isInteger(item.homeGoals) ||
        !Number.isInteger(item.awayGoals) ||
        item.homeGoals < 0 ||
        item.awayGoals < 0,
    );
    if (invalid) {
      showToast("Completa todos los resultados con numeros validos.", "error");
      return [];
    }
  }
  return values;
}

function draftKey() {
  return `prode-2026-draft-${getDeviceId()}`;
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

function renderSubmitted() {
  const totals = bootstrap.leaderboard.find(
    (row) => row.participantId === bootstrap.participant.id,
  ) || { points: 0, exacts: 0, winners: 0, position: "-" };

  app.innerHTML = html`
    <section class="grid">
      <div class="panel">
        <div class="section-head">
          <div>
            <h2>Tu prode esta enviado</h2>
            <p>${escapeHtml(bootstrap.participant.fullName)} · Enviado ${formatDate(bootstrap.participant.submittedAt)}</p>
          </div>
          <span class="badge">Puesto ${totals.position}</span>
        </div>
        <div class="summary">
          <div class="stat"><b>${totals.points}</b><span>Puntos</span></div>
          <div class="stat"><b>${totals.exacts}</b><span>Exactos</span></div>
          <div class="stat"><b>${totals.winners}</b><span>Ganadores</span></div>
        </div>
        <div class="submitted-list">
          ${bootstrap.predictions.map(submittedRow).join("")}
        </div>
      </div>
      ${leaderboardAside()}
    </section>
  `;
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
          <p>Ordenada por puntos y luego por cantidad de resultados exactos.</p>
          <p>R.E = Resultados exactos acertados (4pts)</p>
          <p>R.G = Resultados ganadores acertados (2pts)</p>
        </div>
        <button class="btn secondary" id="refresh-table" type="button">Actualizar</button>
      </div>
      ${leaderboardTable(bootstrap.leaderboard)}
    </section>
  `;
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
          <p>${bootstrap.leaderboard.length} participantes</p>
        </div>
      </div>
      ${leaderboardTable(bootstrap.leaderboard.slice(0, 10), true)}
      <a class="btn secondary" href="/tabla">Ver tabla completa</a>
    </aside>
  `;
}

function leaderboardTable(rows, compact = false) {
  if (!rows.length) return `<div class="notice">Todavia no hay predicciones enviadas.</div>`;
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
    adminState = await api(`/api/admin?key=${encodeURIComponent(key)}`);
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
            <p>${adminState.participants.length} participantes · ${adminState.predictionCount} predicciones cargadas · ${adminState.storage}</p>
          </div>
          <a class="btn secondary" href="/api/admin/export.csv?key=${encodeURIComponent(key)}">Exportar CSV</a>
        </div>
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
  bindAdmin(key);
}

function adminParticipantsList(participants) {
  if (!participants.length) {
    return `<div class="notice">No hay participantes registrados.</div>`;
  }

  return html`
    <div class="admin-participants">
      <h3>Participantes</h3>
      ${participants
        .map(
          (participant) => html`
            <article class="participant-admin-row">
              <div>
                <strong>${escapeHtml(participant.fullName)}</strong>
                <small>${participant.submittedAt ? "Prode enviado" : "Sin enviar"}</small>
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
        <small>Grupo ${match.group} · ${formatDate(match.date)} · ${escapeHtml(match.venue)}</small>
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
          body: JSON.stringify({ matchId, homeGoals, awayGoals }),
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
          body: JSON.stringify({ matchId, clear: true }),
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
        "Vas a borrar este participante y sus predicciones. Confirmas?",
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
    if (tableRoute || bootstrap.participant?.submittedAt) renderPublic();
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
