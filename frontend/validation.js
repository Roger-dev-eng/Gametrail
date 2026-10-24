// Regras compartilhadas entre os formulários e a API: cadastro e edição usam a mesma função.
export class ValidationError extends Error {
  constructor(message, field) { super(message); this.field = field; }
}
const textRule = (label, maxLength, required = true) => ({ label, maxLength, required, type: 'text' });
const intRule = (label, min = 0, max = 2147483647) => ({ label, min, max, required: true, type: 'integer' });
export const fieldRules = {
  jogos: {
    nome: textRule('Nome', 100), ano_lancamento: intRule('Ano', 1),
    desenvolvedora: textRule('Desenvolvedora', 100), genero: textRule('Gênero', 50)
  },
  jogadores: {
    nickname: textRule('Nickname', 50), email: { ...textRule('E-mail', 100), type: 'email' },
    fk_jogo: intRule('Jogo associado', 1)
  },
  plataformas: {
    nome: textRule('Nome', 50), horas_jogadas: intRule('Horas jogadas'), fk_jogador: intRule('Jogador associado', 1)
  },
  avaliacoes: {
    nota: intRule('Nota', 0, 10), comentario: textRule('Comentário', undefined, false),
    status: textRule('Status', 20), data_avaliacao: { label: 'Data', type: 'date', required: true },
    fk_jogador: intRule('Jogador', 1), fk_jogo: intRule('Jogo', 1)
  }
};

export function validateInteger(value, label = 'ID', min = -2147483648, max = 2147483647, field) {
  if (!['string', 'number'].includes(typeof value) || !/^-?\d+$/.test(String(value).trim())) throw new ValidationError(`${label}: informe um número inteiro.`, field);
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new ValidationError(`${label}: informe um valor entre ${min} e ${max}.`, field);
  return number;
}

export function validateRecord(resource, input) {
  if (!Object.hasOwn(fieldRules, resource)) throw new ValidationError('Recurso inválido.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('Informe um objeto JSON.');
  const result = {};
  for (const [field, rule] of Object.entries(fieldRules[resource])) {
    const value = input[field];
    if (value == null || typeof value === 'string' && !value.trim()) {
      if (rule.required) throw new ValidationError(`${rule.label}: campo obrigatório.`, field);
      result[field] = null;
      continue;
    }
    if (rule.type === 'integer') {
      result[field] = validateInteger(value, rule.label, rule.min, rule.max, field);
      continue;
    }
    if (typeof value !== 'string') throw new ValidationError(`${rule.label}: informe um texto válido.`, field);
    const normalized = value.trim();
    if (rule.maxLength && Array.from(normalized).length > rule.maxLength) throw new ValidationError(`${rule.label}: use no máximo ${rule.maxLength} caracteres.`, field);
    if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new ValidationError('E-mail: informe um endereço válido.', field);
    if (rule.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || normalized.startsWith('0000') || !Number.isFinite(Date.parse(normalized)) || new Date(normalized).toISOString().slice(0, 10) !== normalized)) throw new ValidationError('Data inválida. Use yyyy-MM-dd.', field);
    result[field] = normalized;
  }
  if (resource === 'plataformas') result.ultima_sessao = null;
  if (resource === 'jogos') {
    result.igdb_id = input.igdb_id == null || input.igdb_id === '' ? null : validateInteger(input.igdb_id, 'ID do catálogo', 1, 2147483647, 'igdb_id');
    const cover = input.capa_url;
    if (cover != null && cover !== '' && (typeof cover !== 'string' || !/^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_cover_big\/[a-zA-Z0-9_-]+\.jpg$/.test(cover))) throw new ValidationError('Capa do jogo inválida.', 'capa_url');
    result.capa_url = cover || null;
  }
  return result;
}
