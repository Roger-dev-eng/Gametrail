// Reutiliza o SQL e a ordem de leitura das classes DQL Java no Worker.
import { readFileSync, writeFileSync } from 'node:fs';

const queries = {};
for (const table of ['jogos', 'jogadores', 'plataformas', 'avaliacoes']) {
  for (const type of ['Selects', 'Joins', 'Agregacoes']) {
    const source = readFileSync(`database/dql/${table}/${type}.java`, 'utf8');
    for (const match of source.matchAll(/public static [^{]+? (\w+)\([^)]*\)[^{]*\{([\s\S]*?)(?=\n    public static|\n\})/g)) {
      const [, method, body] = match;
      const sqlExpression = body.match(/String sql = ([\s\S]*?);/);
      if (!sqlExpression) continue;
      let index = 0;
      const sql = [...sqlExpression[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
        .map(part => JSON.parse(`"${part[1]}"`)).join('').replace(/\?/g, () => `$${++index}`);
      const row = body.match(/new Object\[\]\s*\{([\s\S]*?)\}/);
      if (!row) throw new Error(`Sem colunas: ${table}.${type}.${method}`);
      const fields = [...row[1].matchAll(/rs\.get\w+\(("[^"]+"|\d+)\)/g)].map(part => JSON.parse(part[1]));
      queries[`${table}.${type}.${method}`] = { sql, fields };
    }
  }
}
writeFileSync('cloudflare/queries.json', JSON.stringify(queries, null, 2) + '\n');
