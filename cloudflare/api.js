import { validateRecord, validateInteger, ValidationError } from '../frontend/validation.js';
import queries from './queries.json' with { type: 'json' };

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = message => { throw new HttpError(400, message); };
function validationResult(operation) {
  try { return operation(); }
  catch (error) {
    if (error instanceof ValidationError) throw new HttpError(400, error.message);
    throw error;
  }
}
export function integer(value, label = 'ID', min = -2147483648, max = 2147483647) {
  return validationResult(() => validateInteger(value, label, min, max));
}
const resources = {
  jogos: { id: 'id_jogo', fields: ['nome', 'ano_lancamento', 'desenvolvedora', 'genero', 'igdb_id', 'capa_url'], labels: ['ID', 'Nome', 'Ano', 'Desenvolvedora', 'Genero'] },
  jogadores: { id: 'id_jogador', fields: ['nickname', 'email', 'fk_jogo'], labels: ['ID', 'Nickname', 'Email', 'Jogo (ID)'] },
  plataformas: { id: 'id_plataforma', fields: ['nome', 'horas_jogadas', 'ultima_sessao', 'fk_jogador'], labels: ['ID', 'Nome', 'Horas', 'Ultima Sessao', 'Jogador (ID)'] },
  avaliacoes: { id: 'id_avaliacao', fields: ['nota', 'comentario', 'status', 'data_avaliacao', 'fk_jogador', 'fk_jogo'], labels: ['ID', 'Nota', 'Comentario', 'Status', 'Data', 'Jogador (ID)', 'Jogo (ID)'] }
};
const getResource = name => Object.hasOwn(resources, name) ? resources[name] : null;

export function validateData(name, input) {
  return validationResult(() => validateRecord(name, input));
}

async function dql(db, key, labels, params = []) {
  const definition = queries[key];
  if (!definition) throw new Error(`Consulta não implementada: ${key}`);
  const result = await db.query(definition.sql, params);
  return result.rows.map(row => Object.fromEntries(labels.map((label, index) => {
    const field = definition.fields[index];
    return [label, row[typeof field === 'number' ? result.fields[field - 1].name : field]];
  })));
}

export async function consulta(db, table = 'Jogos', mode = 'Simples', choice = 'Listar todos', parameter = '') {
  const name = table.toLowerCase();
  const resource = getResource(name);
  if (!resource) fail('Tabela inválida.');
  const select = (method, params = []) => dql(db, `${name}.Selects.${method}`, resource.labels, params);
  const aggregate = (method, labels, params = []) => dql(db, `${name}.Agregacoes.${method}`, labels, params);
  if (mode === 'Simples') {
    if (choice === 'Buscar por ID') return select('buscarPorId', [integer(parameter)]);
    if (choice === 'Buscar por nome') return select('buscarPorNome', [`%${parameter}%`]);
    if (['Listar todos', 'Listar todas'].includes(choice)) return select(['jogos', 'jogadores'].includes(name) ? 'listarTodos' : 'listarTodas');
  }
  if (mode === 'Filtros') {
    const filters = {
      jogos: { 'Filtrar por ano': 'filtrarPorAno', 'Filtrar por genero': 'filtrarPorGenero' },
      jogadores: { 'Buscar por nickname': 'buscarPorNickname' },
      plataformas: { 'Filtrar por nome': 'filtrarPorNome' },
      avaliacoes: { 'Filtrar por nota': 'filtrarPorNota', 'Filtrar por status': 'filtrarPorStatus' }
    };
    const method = filters[name][choice];
    if (method) return select(method, [/ano|nota/.test(choice) ? integer(parameter, 'Parâmetro') : ['filtrarPorStatus', 'filtrarPorGenero'].includes(method) ? parameter : `%${parameter}%`]);
  }
  if (mode === 'Joins') {
    if (name === 'jogadores') return (await db.query('SELECT jg.id_jogador AS "ID", jg.nickname AS "Nickname", jg.email AS "Email", j.nome AS "Jogo" FROM jogadores jg INNER JOIN jogos j ON jg.fk_jogo = j.id_jogo')).rows;
    const joins = {
      jogos: ['jogadoresComJogos', ['ID Jogo', 'Nome', 'Genero', 'ID Jogador', 'Nickname']],
      plataformas: ['plataformasComJogadoresJogos', ['ID Plataforma', 'Plataforma', 'Horas', 'Jogador', 'Jogo', 'Genero']],
      avaliacoes: ['avaliacoesComJogadoresJogos', ['ID', 'Nota', 'Comentario', 'Status', 'Jogador', 'Jogo', 'Genero']]
    };
    return dql(db, `${name}.Joins.${joins[name][0]}`, joins[name][1]);
  }
  if (mode === 'Agregações' || mode === 'Agregacoes') {
    if (choice === 'Contar total') return aggregate('contarTotal', [`Total ${table}`]);
    const options = {
      jogos: { 'Agrupar por genero': ['agruparPorGenero', ['Genero', 'Total']], 'Jogos mais avaliados': ['jogosMaisAvaliados', ['Jogo', 'Total Avaliacoes', 'Media Notas']] },
      jogadores: { 'Contar por jogo': ['contarPorJogo', ['Jogo', 'Total Jogadores']] },
      plataformas: { 'Media horas jogadas': ['mediaHorasJogadas', ['Media Horas']], 'Total de horas por jogador': ['totalHorasPorJogador', ['Jogador', 'Total Horas']] },
      avaliacoes: {
        'Media notas gerais': ['mediaNotasGerais', ['Media Notas']],
        'Media notas por jogo': ['mediaNotasPorJogo', ['Jogo', 'Media', 'Total']],
        'Distribuicao de notas': ['distribuicaoNotas', ['Nota', 'Quantidade']],
        'Jogos mais avaliados': ['jogosMaisAvaliados', ['Jogo', 'Total Avaliacoes', 'Media']],
        'Avaliacoes recentes': ['avaliacoesRecentes', ['ID', 'Nota', 'Jogo', 'Jogador', 'Data']]
      }
    };
    const option = options[name][choice];
    if (option) return aggregate(...option, choice === 'Avaliacoes recentes' ? [integer(parameter, 'Dias', 0)] : []);
  }
  fail('Consulta inválida.');
}

export async function dashboard(db) {
  const statements = {
    jogos: 'SELECT COUNT(*) AS total FROM jogos',
    jogadores: 'SELECT COUNT(*) AS total FROM jogadores',
    media: 'SELECT COALESCE(ROUND(AVG(fn_media_jogo(id_jogo)), 2), 0) AS total FROM jogos',
    generos: "SELECT COALESCE(genero, 'Sem gênero') AS nome, COUNT(*) AS total FROM jogos GROUP BY genero ORDER BY total DESC",
    ranking: 'SELECT nome, quantidade_avaliacoes AS total FROM vw_resumo_jogos ORDER BY quantidade_avaliacoes DESC, nome LIMIT 10',
    status: "SELECT COALESCE(status, 'Sem status') AS nome, COUNT(*) AS total FROM avaliacoes GROUP BY status ORDER BY total DESC"
  };
  const result = {};
  for (const [key, sql] of Object.entries(statements)) result[key] = (await db.query(sql)).rows;
  result.mediaJogos = await consulta(db, 'Avaliacoes', 'Agregações', 'Media notas por jogo');
  result.notas = await consulta(db, 'Avaliacoes', 'Agregações', 'Distribuicao de notas');
  result.horasJogadores = await consulta(db, 'Plataformas', 'Agregações', 'Total de horas por jogador');
  return result;
}

export async function api(request, db, catalog) {
  const url = new URL(request.url);
  const parts = url.pathname.slice(5).split('/');
  const [name, rawId] = parts;
  if (parts.length > 2) throw new HttpError(404, 'Recurso não encontrado.');
  if (name === 'dashboard' && !rawId && request.method === 'GET') return Response.json(await dashboard(db));
  if (name === 'consultas' && !rawId && request.method === 'GET') {
    const q = url.searchParams;
    return Response.json(await consulta(db, q.get('tabela') ?? 'Jogos', q.get('modo') ?? 'Simples', q.get('consulta') ?? 'Listar todos', q.get('parametro') ?? ''));
  }
  const resource = getResource(name);
  if (!resource) throw new HttpError(404, 'Recurso não encontrado.');
  const id = rawId === undefined ? null : integer(rawId, 'ID', 1);
  if (request.method === 'GET' && id === null) return Response.json((await db.query(`SELECT ${resource.id}, ${resource.fields.join(', ')} FROM ${name} ORDER BY ${resource.id}`)).rows);
  if (request.method === 'GET' && id !== null) {
    const result = await db.query(`SELECT ${resource.id}, ${resource.fields.join(', ')} FROM ${name} WHERE ${resource.id}=$1`, [id]);
    if (!result.rows.length) throw new HttpError(404, 'Registro não encontrado.');
    return Response.json(result.rows[0]);
  }
  if (request.method === 'DELETE' && id !== null) {
    const result = await db.query(`DELETE FROM ${name} WHERE ${resource.id}=$1`, [id]);
    if (!result.rowCount) throw new HttpError(404, 'Registro não encontrado.');
    return Response.json({ ok: true });
  }
  if ((request.method === 'POST' && id === null) || (request.method === 'PUT' && id !== null)) {
    let input;
    try { input = await request.json(); } catch { fail('JSON inválido.'); }
    const data = validateData(name, input);
    if (name === 'jogos' && data.igdb_id !== null) {
      if (!catalog) throw new HttpError(503, 'O catálogo ainda não está configurado.');
      const official = await catalog.getGame(data.igdb_id);
      data.capa_url = official.capa_url;
      const duplicate = await db.query('SELECT id_jogo FROM jogos WHERE igdb_id=$1 AND ($2::integer IS NULL OR id_jogo<>$2)', [data.igdb_id, id]);
      if (duplicate.rows.length) throw new HttpError(409, 'Este jogo do IGDB já está cadastrado.');
    }
    const values = resource.fields.map(field => data[field]);
    const updating = request.method === 'PUT';
    // A procedure e a atualização são atômicas e usam a mesma conexão.
    const transaction = updating && name === 'avaliacoes';
    if (transaction) await db.query('BEGIN');
    try {
      const sql = updating
        ? `UPDATE ${name} SET ${resource.fields.map((field, i) => `${field}=$${i + 1}`).join(', ')} WHERE ${resource.id}=$${values.length + 1}`
        : `INSERT INTO ${name} (${resource.fields.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})`;
      const result = await db.query(sql, updating ? [...values, id] : values);
      if (updating && !result.rowCount) throw new HttpError(404, 'Registro não encontrado.');
      if (transaction) {
        await db.query('CALL pr_atualizar_status_avaliacao($1, $2)', [id, data.status]);
        await db.query('COMMIT');
      }
    } catch (error) {
      if (transaction) await db.query('ROLLBACK');
      throw error;
    }
    return Response.json({ ok: true }, { status: updating ? 200 : 201 });
  }
  throw new HttpError(405, 'Método não permitido.');
}
