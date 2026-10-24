import { fieldRules, validateRecord } from './validation.js';

const schemas = {
  jogos: { title: "Jogos", singular: "Jogo", article: "Novo", id: "id_jogo", columns: ["id_jogo", "capa_url", "nome", "ano_lancamento", "desenvolvedora", "genero"], fields: [["nome", "Nome", "text"], ["ano_lancamento", "Ano", "number"], ["desenvolvedora", "Desenvolvedora", "text"], ["genero", "Gênero", "text"]] },
  jogadores: { title: "Jogadores", singular: "Jogador", article: "Novo", id: "id_jogador", columns: ["id_jogador", "nickname", "email", "fk_jogo"], fields: [["nickname", "Nickname", "text"], ["email", "E-mail", "email"], ["fk_jogo", "Jogo associado", "number"]] },
  plataformas: { title: "Plataformas", singular: "Plataforma", article: "Nova", id: "id_plataforma", columns: ["id_plataforma", "nome", "horas_jogadas", "ultima_sessao", "fk_jogador"], fields: [["nome", "Nome", "text"], ["horas_jogadas", "Horas jogadas", "number"], ["fk_jogador", "Jogador associado", "number"]] },
  avaliacoes: { title: "Avaliações", singular: "Avaliação", article: "Nova", id: "id_avaliacao", columns: ["id_avaliacao", "nota", "comentario", "status", "data_avaliacao", "fk_jogador", "fk_jogo"], fields: [["nota", "Nota", "number"], ["comentario", "Comentário", "text"], ["status", "Status", "text"], ["data_avaliacao", "Data", "date"], ["fk_jogador", "Jogador", "number"], ["fk_jogo", "Jogo", "number"]] }
};
const labels = { capa_url: "Capa", id_jogo: "ID", id_jogador: "ID", id_plataforma: "ID", id_avaliacao: "ID", nome: "Nome", nickname: "Nickname", email: "E-mail", ano_lancamento: "Ano", desenvolvedora: "Desenvolvedora", genero: "Gênero", horas_jogadas: "Horas", ultima_sessao: "Última sessão", fk_jogo: "Jogo", fk_jogador: "Jogador", nota: "Nota", comentario: "Comentário", status: "Status", data_avaliacao: "Data" };
const element = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const resourceCache = new Map();
let navigationSequence = 0;

async function api(path, options) {
  document.body.classList.add("is-loading");
  try {
    let response;
    try {
      response = await fetch(`/api/${path}`, options || {});
    } catch {
      throw new Error("O servidor não está respondendo. Verifique sua conexão e tente novamente.");
    }
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`O servidor retornou uma resposta inválida (${response.status}).`);
    }
    if (!response.ok) throw new Error(data.error || "Falha na operação.");
    return data;
  } finally {
    document.body.classList.remove("is-loading");
  }
}

function showToast(message, isError) {
  const toast = element("#toast");
  toast.textContent = message;
  toast.className = isError ? "error" : "ok";
  setTimeout(() => { toast.className = ""; }, 3000);
}

function navigate(page) {
  const navigationId = ++navigationSequence;
  document.querySelectorAll("#nav button").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  if (page === "home") renderHome();
  else if (page === "dashboard") renderDashboard();
  else if (page === "consultas") renderQueries();
  else renderResource(page, navigationId);
}

function atomButton(label, action, kind = "secondary") {
  return `<button class="action-button ${kind}" data-action="${action}">${label}</button>`;
}

function moleculeModuleCard(key, name, description, index) {
  return `<article class="overview-card"><div class="card-index">0${index}</div><h3>${name}</h3><p>${description}</p><div class="card-actions">${atomButton("Cadastrar", `create:${key}`, "primary")} ${atomButton("Ver registros", `view:${key}`)}</div></article>`;
}

function renderHome() {
  const modules = [
    ["jogos", "Jogos", "Catálogo, gênero e desenvolvedora."],
    ["jogadores", "Jogadores", "Perfis e jogos associados."],
    ["plataformas", "Plataformas", "Horas jogadas e vínculos."],
    ["avaliacoes", "Avaliações", "Notas, status e comentários."]
  ];
  element("#content").innerHTML = `<section class="overview-hero"><div><span class="eyebrow">VISÃO GERAL / MENU PRINCIPAL</span><h1>Bom te ver,<br><em>${escapeHtml(element("#user-label").textContent)}.</em></h1><p>Escolha uma ação para começar. Todos os cadastros ficam disponíveis aqui.</p></div><div class="quick-actions"><span class="eyebrow">ACESSO RÁPIDO</span>${atomButton("Abrir dashboard", "dashboard", "quick")} ${atomButton("Executar consultas", "consultas", "quick")}</div></section><section><div class="section-heading"><div><span class="eyebrow">OPERAÇÃO</span><h2>Cadastros</h2></div><p>Crie e consulte os registros do sistema.</p></div><div class="overview-grid">${modules.map((module, index) => moleculeModuleCard(module[0], module[1], module[2], index + 1)).join("")}</div></section>`;
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => {
      const [action, resource] = button.dataset.action.split(":");
      if (action === "create") renderForm(resource, {});
      else navigate(resource || action);
    };
  });
}

async function renderResource(resource, navigationId = ++navigationSequence) {
  const schema = schemas[resource];
  try {
    const cached = resourceCache.get(resource);
    let rows;
    if (cached && Date.now() - cached.updatedAt < 60000) {
      rows = cached.rows;
    } else {
      element("#content").innerHTML = `<header><span class="eyebrow">MÓDULO OPERACIONAL</span><h1>${schema.title}</h1><p>Carregando registros...</p></header>`;
      rows = await api(resource);
      resourceCache.set(resource, { rows, updatedAt: Date.now() });
    }
    if (navigationId !== navigationSequence) return;
    const pageSize = 20;
    let currentPage = 1;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

    function renderTablePage() {
      const start = (currentPage - 1) * pageSize;
      const visibleRows = rows.slice(start, start + pageSize);
      const tableRows = visibleRows.map((row) => `<tr>${schema.columns.map((column) => `<td>${column === "capa_url" ? gameCover(row) : escapeHtml(row[column])}</td>`).join("")}<td><button class="edit" data-id="${row[schema.id]}">Editar</button><button class="del" data-id="${row[schema.id]}">Excluir</button></td></tr>`).join("") || `<tr><td colspan="${schema.columns.length + 1}">Nenhum registro.</td></tr>`;
      element("#records-table-body").innerHTML = tableRows;
      element("#page-info").textContent = `Página ${currentPage} de ${totalPages} · ${rows.length} registro(s)`;
      element("#previous-page").disabled = currentPage === 1;
      element("#next-page").disabled = currentPage === totalPages;
      document.querySelectorAll(".edit").forEach((button) => { button.onclick = () => renderForm(resource, rows.find((row) => String(row[schema.id]) === button.dataset.id)); });
      document.querySelectorAll(".del").forEach((button) => { button.onclick = () => deleteResource(resource, button.dataset.id); });
    }

    element("#content").innerHTML = `<header class="row"><div><span class="eyebrow">MÓDULO OPERACIONAL</span><h1>${schema.title}</h1><p>${rows.length} registro(s) armazenado(s).</p></div><button id="new">+ ${schema.article} ${schema.singular}</button></header><div class="table"><table><thead><tr>${schema.columns.map((column) => `<th>${labels[column] || column}</th>`).join("")}<th>AÇÕES</th></tr></thead><tbody id="records-table-body"></tbody></table><div class="pagination"><button id="previous-page" class="page-button">← Anterior</button><span id="page-info"></span><button id="next-page" class="page-button">Próxima →</button></div></div>`;
    element("#new").onclick = () => renderForm(resource, {});
    element("#previous-page").onclick = () => { currentPage -= 1; renderTablePage(); };
    element("#next-page").onclick = () => { currentPage += 1; renderTablePage(); };
    renderTablePage();
  } catch (error) { if (navigationId === navigationSequence) renderError(error); }
}

function gameCover(game) {
  const url = game.capa_url;
  return typeof url === "string" && /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_cover_big\/[a-zA-Z0-9_-]+\.jpg$/.test(url)
    ? `<img class="game-cover" src="${escapeHtml(url)}" alt="Capa de ${escapeHtml(game.nome)}" loading="lazy" referrerpolicy="no-referrer">`
    : '<span class="game-cover game-cover-empty">Sem capa</span>';
}

function renderGameSearch(onReturn, previousTerm = "") {
  const navigationId = navigationSequence;
  element("#content").innerHTML = `<header class="row"><div><span class="eyebrow">CATÁLOGO DE JOGOS</span><h1>Novo jogo</h1><p>Pesquise, escolha a versão e revise os dados antes de cadastrar.</p></div><button class="back" id="catalog-back">← Voltar</button></header><section class="game-search-panel"><form id="catalog-search-form"><label for="game-search">Nome do jogo</label><div class="game-search-input"><input id="game-search" type="search" minlength="3" maxlength="120" placeholder="Ex.: God of War" autocomplete="off" value="${escapeHtml(previousTerm)}"><button type="submit">Pesquisar</button></div></form><button id="manual-game" class="back">Cadastrar manualmente</button><p class="catalog-credit">Dados e capas fornecidos pelo <a href="https://www.igdb.com" target="_blank" rel="noopener noreferrer">IGDB</a>.</p></section><div id="game-search-results" aria-live="polite"><p>Digite pelo menos 3 caracteres para pesquisar.</p></div>`;
  const input = element("#game-search");
  const output = element("#game-search-results");
  let sequence = 0;
  let timer;
  const current = id => id === sequence && navigationId === navigationSequence && element("#game-search") === input;
  element("#catalog-back").onclick = () => onReturn ? onReturn() : navigate("home");
  element("#manual-game").onclick = () => {
    sequence++;
    clearTimeout(timer);
    renderForm("jogos", {}, onReturn, true);
    element("#back").onclick = () => renderGameSearch(onReturn, input.value);
  };
  async function search(id) {
    const term = input.value.trim();
    if (term.length < 3) { output.innerHTML = '<p>Digite pelo menos 3 caracteres para pesquisar.</p>'; return; }
    if (term.length > 120) { output.innerHTML = '<p>Use no máximo 120 caracteres na pesquisa.</p>'; return; }
    output.innerHTML = '<p>Buscando jogos...</p>';
    try {
      const games = await api(`catalogo/jogos?q=${encodeURIComponent(term)}`);
      if (!current(id)) return;
      output.innerHTML = games.length ? `<div class="game-search-grid">${games.map((game, index) => `<article class="game-card">${gameCover(game)}<div><h2>${escapeHtml(game.nome)}</h2><p>${escapeHtml(game.ano_lancamento || "Ano não informado")}</p><p>${escapeHtml(game.desenvolvedora || "Desenvolvedora não informada")}</p><button class="select-game" data-game="${index}">Selecionar jogo</button></div></article>`).join("")}</div>` : '<p>Nenhum jogo encontrado. Tente outro nome ou use o cadastro manual.</p>';
      output.querySelectorAll(".select-game").forEach(button => {
        button.onclick = () => {
          if (!current(id)) return;
          sequence++;
          const game = games[Number(button.dataset.game)];
          renderForm("jogos", game, onReturn);
          element("#back").onclick = () => renderGameSearch(onReturn, term);
        };
      });
    } catch (error) {
      if (current(id)) output.innerHTML = `<div class="error"><h2>Não foi possível buscar os jogos</h2><p>${escapeHtml(error.message)}</p><p>Você pode tentar novamente ou cadastrar manualmente.</p></div>`;
    }
  }
  input.oninput = () => {
    clearTimeout(timer);
    const id = ++sequence;
    output.innerHTML = input.value.trim().length < 3 ? '<p>Digite pelo menos 3 caracteres para pesquisar.</p>' : '<p>Aguardando a pesquisa...</p>';
    if (input.value.trim().length >= 3) timer = setTimeout(() => search(id), 400);
  };
  element("#catalog-search-form").onsubmit = async event => { event.preventDefault(); clearTimeout(timer); await search(++sequence); };
  if (previousTerm.length >= 3) input.oninput();
}

function renderForm(resource, row, onReturn, manual = false) {
  if (resource === "jogos" && !row.id_jogo && !row.igdb_id && !manual) return renderGameSearch(onReturn);
  const schema = schemas[resource];
  const fields = schema.fields.map(([name, label, type]) => {
    const rule = fieldRules[resource][name];
    const constraints = [rule.required ? 'required' : '', rule.min !== undefined ? `min="${rule.min}" max="${rule.max}" step="1"` : '', rule.maxLength ? `maxlength="${rule.maxLength}"` : ''].filter(Boolean).join(' ');
    return `<label>${label}<input name="${name}" type="${type}" ${constraints} value="${escapeHtml(row[name])}"></label>`;
  }).join("");
  const heading = row[schema.id] ? `Editar ${schema.singular}` : `${schema.article} ${schema.singular}`;
  element("#content").innerHTML = `<header class="row"><div><span class="eyebrow">${row[schema.id] ? "EDITAR" : "NOVO"} REGISTRO</span><h1>${heading}</h1></div><button class="back" id="back">← Voltar</button></header><form id="record" class="form" novalidate>${fields}<button type="submit">Salvar registro →</button></form>`;
  if (resource === "jogos" && row.igdb_id) {
    element("#record").insertAdjacentHTML("beforebegin", `<section class="game-preview">${gameCover(row)}<div><span class="eyebrow">PRÉVIA DO CADASTRO · IGDB</span><h2>${escapeHtml(row.nome)}</h2><p>Revise os dados e complete as informações que estiverem faltando. O cadastro só será realizado ao salvar.</p></div></section>`);
  }
  element("#back").onclick = () => onReturn ? onReturn() : navigate("home");
  element("#record").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = validateRecord(resource, { ...Object.fromEntries(new FormData(event.target)), ...(resource === "jogos" ? { igdb_id: row.igdb_id, capa_url: row.capa_url } : {}) });
      await api(row[schema.id] ? `${resource}/${row[schema.id]}` : resource, { method: row[schema.id] ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      resourceCache.delete(resource);
      showToast("Registro salvo.");
      if (onReturn) await onReturn();
      else renderResource(resource);
    } catch (error) {
      showToast(error.message, true);
      if (error.field) event.target.elements?.namedItem(error.field)?.focus();
    }
  };
}

async function deleteResource(resource, id, onReturn) {
  if (!confirm("Excluir este registro?")) return;
  try { await api(`${resource}/${id}`, { method: "DELETE" }); resourceCache.delete(resource); showToast("Registro excluído."); if (onReturn) await onReturn(); else renderResource(resource); }
  catch (error) { showToast(error.message, true); }
}

async function renderDashboard() {
  try {
    const data = await api("dashboard");
    const value = (key) => data[key][0] ? data[key][0].total : 0;
    const mediaJogos = [...data.mediaJogos].sort((a, b) => Number(b.Total) - Number(a.Total) || Number(b.Media) - Number(a.Media));
    const horasJogadores = [...data.horasJogadores].sort((a, b) => Number(b["Total Horas"]) - Number(a["Total Horas"]));
    element("#content").innerHTML = `<header><span class="eyebrow">DASHBOARD / AO VIVO</span><h1>Visão analítica</h1><p>Leitura rápida do movimento no banco.</p></header><div class="metrics"><div>JOGOS<strong>${value("jogos")}</strong></div><div>JOGADORES<strong>${value("jogadores")}</strong></div><div class="lime">MÉDIA DAS NOTAS<strong>${Number(value("media")).toFixed(2)}</strong></div></div><div class="charts"><section><span class="eyebrow">DISTRIBUIÇÃO</span><h2>Jogos por gênero</h2>${renderBars(data.generos)}</section><section><span class="eyebrow">RANKING</span><h2>Mais avaliados</h2>${renderBars(data.ranking)}</section><section><span class="eyebrow">STATUS</span><h2>Status das avaliações</h2>${renderBars(data.status)}</section><section><span class="eyebrow">NOTAS</span><h2>Distribuição de notas</h2>${renderBars(data.notas, "Nota", "Quantidade")}</section></div><div class="analysis-grid"><section class="analysis-panel"><span class="eyebrow">DESEMPENHO</span><h2>Média de notas por jogo</h2>${renderAnalysisTable(mediaJogos)}</section><section class="analysis-panel"><span class="eyebrow">ENGAJAMENTO</span><h2>Horas por jogador</h2>${renderAnalysisTable(horasJogadores)}</section></div>`;
  } catch (error) { renderError(error); }
}

function renderBars(rows, labelKey = "nome", valueKey = "total") {
  const max = Math.max(...rows.map((row) => Number(row[valueKey])), 1);
  return rows.map((row) => `<p class="bar"><span>${escapeHtml(row[labelKey])}</span><i style="width:${Number(row[valueKey]) / max * 100}%"></i><b>${row[valueKey]}</b></p>`).join("");
}

function renderAnalysisTable(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return `<div class="analysis-table"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 10).map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("") || "<tr><td>Nenhum dado disponível.</td></tr>"}</tbody></table></div>`;
}

async function renderQueries(previousQuery) {
  const navigationId = navigationSequence;
  let querySequence = 0;
  const options = {
    Jogos: {
      Simples: ["Listar todos", "Buscar por ID", "Buscar por nome"],
      Filtros: ["Filtrar por genero", "Filtrar por ano"],
      Joins: ["Jogos com jogadores"],
      Agregações: ["Contar total", "Agrupar por genero", "Jogos mais avaliados"]
    },
    Jogadores: {
      Simples: ["Listar todos", "Buscar por ID", "Buscar por nome"],
      Filtros: ["Buscar por nickname"],
      Joins: ["Jogadores com jogos"],
      Agregações: ["Contar total", "Contar por jogo"]
    },
    Plataformas: {
      Simples: ["Listar todas", "Buscar por ID", "Buscar por nome"],
      Filtros: ["Filtrar por nome"],
      Joins: ["Plataformas com jogadores e jogos"],
      Agregações: ["Contar total", "Media horas jogadas", "Total de horas por jogador"]
    },
    Avaliacoes: {
      Simples: ["Listar todas", "Buscar por ID", "Buscar por nome"],
      Filtros: ["Filtrar por nota", "Filtrar por status"],
      Joins: ["Avaliações com jogadores e jogos"],
      Agregações: ["Contar total", "Media notas gerais", "Media notas por jogo", "Distribuicao de notas", "Jogos mais avaliados", "Avaliacoes recentes"]
    }
  };
  const tableSelect = Object.keys(options).map((table) => `<option>${table}</option>`).join("");
  element("#content").innerHTML = `<header><span class="eyebrow">EXPLORAÇÃO / DQL</span><h1>Consultas</h1><p>Execute consultas simples, filtros, joins e agregações diretamente no banco.</p></header><div class="query query-builder"><label>Tabela<select id="query-table">${tableSelect}</select></label><label>Modo<select id="query-mode"><option>Simples</option><option>Filtros</option><option>Joins</option><option>Agregações</option></select></label><label>Consulta<select id="query-choice"></select></label><label id="query-parameter-label">Parâmetro<input id="query-parameter" placeholder="Opcional"></label><button id="run-query">Executar consulta →</button></div><div id="query-result"></div>`;
  const table = element("#query-table");
  const mode = element("#query-mode");
  const choice = element("#query-choice");
  const parameterLabel = element("#query-parameter-label");

  function updateParameterVisibility() {
    const needsParameter = mode.value === "Filtros" || mode.value === "Simples" && ["Buscar por ID", "Buscar por nome"].includes(choice.value) || choice.value === "Avaliacoes recentes";
    parameterLabel.style.display = needsParameter ? "flex" : "none";
    element("#query-parameter").placeholder = choice.value === "Avaliacoes recentes" ? "Quantidade" : "Valor da consulta";
  }

  function updateChoices() {
    choice.innerHTML = options[table.value][mode.value].map((item) => `<option>${item}</option>`).join("");
    updateParameterVisibility();
  }
  table.onchange = updateChoices;
  mode.onchange = updateChoices;
  choice.onchange = updateParameterVisibility;
  if (previousQuery) {
    table.value = previousQuery.table;
    mode.value = previousQuery.mode;
  }
  updateChoices();
  if (previousQuery) {
    choice.value = previousQuery.choice;
    element("#query-parameter").value = previousQuery.parameter;
    updateParameterVisibility();
  }
  element("#run-query").onclick = async () => {
    const queryId = ++querySequence;
    const selection = { table: table.value, mode: mode.value, choice: choice.value, parameter: element("#query-parameter").value };
    const isCurrent = () => navigationId === navigationSequence && queryId === querySequence && element("#query-table") === table;
    try {
      const url = `consultas?tabela=${encodeURIComponent(selection.table)}&modo=${encodeURIComponent(selection.mode)}&consulta=${encodeURIComponent(selection.choice)}&parametro=${encodeURIComponent(selection.parameter)}`;
      const rows = await api(url);
      if (!isCurrent()) return;
      const parameter = selection.parameter.trim();
      if (!rows.length && parameter) {
        element("#query-result").innerHTML = `<div class="error"><h2>Nenhum resultado encontrado</h2><p>Não encontramos resultados para o parâmetro "${escapeHtml(parameter)}" na consulta "${escapeHtml(selection.choice)}" da tabela "${escapeHtml(selection.table)}". Confira o valor informado e tente novamente.</p></div>`;
        return;
      }
      const columns = rows.length ? Object.keys(rows[0]) : [];
      const resource = selection.table.toLowerCase();
      const actionable = ["Simples", "Filtros", "Joins"].includes(selection.mode) || resource === "avaliacoes" && selection.choice === "Avaliacoes recentes";
      const idColumn = selection.mode === "Joins" ? ({ jogos: "ID Jogo", plataformas: "ID Plataforma" }[resource] || "ID") : "ID";
      const restoreQuery = () => renderQueries(selection);
      element("#query-result").innerHTML = `<div class="query-result-heading"><span>Resultado · ${rows.length} linha(s)</span></div><div class="table"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}${actionable && rows.length ? "<th>AÇÕES</th>" : ""}</tr></thead><tbody>${rows.map((row, index) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}${actionable ? `<td><button class="edit" data-row="${index}">Editar</button><button class="del" data-row="${index}">Excluir</button></td>` : ""}</tr>`).join("") || `<tr><td>Nenhum resultado encontrado.</td></tr>`}</tbody></table></div>`;
      element("#query-result").querySelectorAll(".edit").forEach((button) => {
        button.onclick = async () => {
          button.disabled = true;
          try {
            const row = await api(`${resource}/${rows[Number(button.dataset.row)][idColumn]}`);
            if (isCurrent()) renderForm(resource, row, restoreQuery);
          } catch (error) { if (isCurrent()) showToast(error.message, true); }
          finally { button.disabled = false; }
        };
      });
      element("#query-result").querySelectorAll(".del").forEach((button) => {
        button.onclick = async () => {
          button.disabled = true;
          try { await deleteResource(resource, rows[Number(button.dataset.row)][idColumn], async () => { if (isCurrent()) await restoreQuery(); }); }
          finally { button.disabled = false; }
        };
      });
    } catch (error) {
      if (isCurrent()) element("#query-result").innerHTML = `<div class="error"><h2>Não foi possível executar a consulta</h2><p>${escapeHtml(error.message)}</p></div>`;
    }
  };
  if (previousQuery) await element("#run-query").onclick();
}

function renderError(error) { element("#content").innerHTML = `<div class="error"><h1>Não foi possível carregar.</h1><p>${escapeHtml(error.message)}</p></div>`; }

function enterApp(user) {
  element("#login").classList.add("hidden");
  element("#app").classList.remove("hidden");
  element("#user-label").textContent = user;
  element("#initial").textContent = user.charAt(0).toUpperCase();
  navigate("home");
}

element("#login-form").onsubmit = (event) => {
  event.preventDefault();
  const user = element("#user-name").value.trim();
  if (!user) return;
  if (/\d/.test(user)) {
    showToast("O nome informado não pode conter números.", true);
    return;
  }
  localStorage.setItem("arcade-user", user);
  enterApp(user);
};
element("#logout").onclick = () => { localStorage.removeItem("arcade-user"); window.location.reload(); };
document.querySelectorAll("#nav button").forEach((button) => { button.onclick = () => navigate(button.dataset.page); });
const savedUser = localStorage.getItem("arcade-user");
if (savedUser && /\d/.test(savedUser)) {
  localStorage.removeItem("arcade-user");
  showToast("O nome informado não pode conter números.", true);
} else if (savedUser) enterApp(savedUser);
