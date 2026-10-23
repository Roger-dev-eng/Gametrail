# Sistema Web de Gerenciamento de Jogos

Aplicação JavaScript para gerenciar jogos, jogadores, plataformas e avaliações, com CRUD, consultas SQL e dashboard analítico. O mesmo backend Cloudflare Workers é usado localmente e em produção, com PostgreSQL do Supabase via Hyperdrive.

## Conteúdo

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Arquitetura](#arquitetura)
- [Modelo de dados da aplicação](#modelo-de-dados-da-aplicação)
- [Requisitos](#requisitos)
- [Configuração do banco](#configuração-do-banco)
- [Aplicação web](#aplicação-web)
- [Fluxo da aplicação](#fluxo-da-aplicação)
- [Consultas disponíveis](#consultas-disponíveis)
- [Views, functions e procedures](#views-functions-e-procedures)
- [Validações implementadas](#validações-implementadas)
- [Testes e validação](#testes-e-validação)
- [Limites gratuitos](#limites-gratuitos)
- [Vídeo Explicativo e Demonstrativo](#vídeo-explicativo-e-demonstrativo)

## Visão geral

O sistema reúne identificação do usuário, menu principal, cadastros, consultas e dashboard em uma única interface. As operações são realizadas no PostgreSQL por uma API JavaScript, compartilhada entre desenvolvimento local e produção.

## Stack

- JavaScript, HTML e CSS.
- Cloudflare Workers, Static Assets e Hyperdrive.
- PostgreSQL / Supabase.
- Node.js 22+ e pnpm 11.25.0 para desenvolvimento, testes e deploy.

## Estrutura do projeto

```text
cloudflare/
  worker.js          # entrada HTTP e conexão Hyperdrive
  api.js             # CRUD, validações, consultas e dashboard
  queries.json       # catálogo SQL usado pelo backend
  api.test.js        # testes com PostgreSQL em memória
frontend/            # HTML, CSS e JavaScript da interface
database/            # SQL comentado: estrutura, operações e consultas
diagrama/            # diagrama entidade-relacionamento original
scripts/
  check-deploy.js    # bloqueia deploy com ID provisório do Hyperdrive
wrangler.jsonc
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

A pasta `database` contém somente SQL comentado, organizado em DDL, DML, DQL, views, functions e procedures. As antigas classes Java foram convertidas para `.sql`; a criação das tabelas está consolidada em `database/ddl/01_schema.sql`. A pasta `diagrama` permanece preservada. O catálogo usado pela API é mantido diretamente em `cloudflare/queries.json`.

Os arquivos de DML e DQL são modelos de instruções parametrizadas PostgreSQL: `$1`, `$2` e assim por diante representam os valores descritos nos comentários. Para executar uma instrução no SQL Editor, substitua esses parâmetros por valores SQL apropriados; em um driver PostgreSQL, envie-os como parâmetros separados. Esses modelos não são scripts de instalação nem são executados automaticamente pela aplicação.

## Arquitetura

O frontend chama as rotas `/api/` do Worker. `cloudflare/worker.js` abre uma conexão PostgreSQL por requisição via Hyperdrive, encaminha as operações para `cloudflare/api.js` e encerra a conexão ao terminar. Static Assets serve o frontend.

## Aplicação web

- CRUD de jogos, jogadores, plataformas e avaliações.
- Consultas simples, busca por ID e nome, filtros, joins e agregações.
- Dashboard com totais, médias, gêneros, ranking, status, notas e horas por jogador.
- Validação de campos obrigatórios, inteiros, datas e faixas numéricas.
- SQL parametrizado e identificação de recursos por uma lista permitida.
- Atualização de avaliações e chamada da procedure em uma transação com rollback em caso de falha.

## Modelo de dados da aplicação

- `Jogo`: nome, ano de lançamento, desenvolvedora e gênero.
- `Jogador`: nickname, email e jogo associado.
- `Plataforma`: nome, horas jogadas, última sessão e jogador associado.
- `Avaliacao`: nota, comentário, status, data, jogador e jogo associados.

Os relacionamentos estão documentados em `diagrama/Diagrama Entidade-Relacionamento.pdf` e definidos em `database/ddl/01_schema.sql`.

## Requisitos

- Node.js 22 ou superior e pnpm 11.25.0.
- Um banco PostgreSQL/Supabase com os scripts SQL instalados.
- Conexão de desenvolvimento configurada em `.dev.vars` para executar localmente.
- Conta Cloudflare com Hyperdrive configurado para publicar.

## Configuração do banco

Use um projeto PostgreSQL/Supabase. Para uma instalação nova, execute os scripts nesta ordem no SQL Editor do Supabase ou pelo `psql`:

1. `database/ddl/01_schema.sql`
2. `database/views/01_view_resumo_jogos.sql`
3. `database/functions/01_function_media_jogo.sql`
4. `database/procedure/01_procedure_atualizar_status_avaliacao.sql`

O banco existente e seus dados podem continuar sendo usados. O dashboard usa `vw_resumo_jogos` e `fn_media_jogo`; a atualização de uma avaliação chama `pr_atualizar_status_avaliacao`.

## Testes e validação

```powershell
pnpm test
pnpm check
```

Os testes executam os scripts SQL do projeto em PostgreSQL em memória com PGlite e verificam CRUD, todas as opções de consulta do frontend, dashboard, validações, vínculos e rollback.

`pnpm check` monta o pacote com `wrangler deploy --dry-run`, sem publicar.

## Fluxo da aplicação

1. O usuário informa seu nome na tela de login.
2. O menu principal permite acessar cadastros, consultas e dashboard.
3. Nos cadastros, o usuário lista, cria, edita e exclui registros.
4. Na tela de consultas, escolhe a tabela, o modo, a consulta e o parâmetro quando necessário.
5. O dashboard apresenta os indicadores e gráficos calculados a partir dos dados do banco.

## Consultas disponíveis

As consultas são organizadas por jogos, jogadores, plataformas e avaliações, com quatro modos:

- `Simples`: listagem geral e busca por ID ou nome; nas avaliações, a busca textual usa o comentário.
- `Filtros`: gênero, ano, nickname, nome de plataforma, nota ou status, conforme a tabela.
- `Joins`: cruzamento entre jogos, jogadores, plataformas e avaliações.
- `Agregações`: totais, médias, agrupamentos, distribuição de notas e avaliações recentes.

O Worker seleciona as consultas em `cloudflare/queries.json`. Os exemplos comentados ficam em `database/dql/`.

## Views, functions e procedures

- `database/views/01_view_resumo_jogos.sql`: cria a view `vw_resumo_jogos`, com quantidade de avaliações e média das notas por jogo.
- `database/functions/01_function_media_jogo.sql`: cria a function `fn_media_jogo`, que calcula a média das notas de um jogo.
- `database/procedure/01_procedure_atualizar_status_avaliacao.sql`: cria a procedure `pr_atualizar_status_avaliacao`, que atualiza o status pelo ID da avaliação.

Execute esses scripts após a criação das tabelas, seguindo a ordem da seção [Configuração do banco](#configuração-do-banco).

```sql
SELECT * FROM vw_resumo_jogos ORDER BY media_nota DESC;
SELECT fn_media_jogo(1);
CALL pr_atualizar_status_avaliacao(1, 'Aprovada');
```

## Validações implementadas

As validações estão centralizadas em `cloudflare/api.js` e incluem:

- Campos obrigatórios e remoção de espaços nas extremidades dos textos.
- Números inteiros e limites permitidos.
- Notas entre 0 e 10.
- Datas válidas no formato `yyyy-MM-dd`.
- IDs, recursos e consultas permitidos pela API.

O PostgreSQL também aplica as restrições do esquema, como chaves estrangeiras e email único. O Worker trata os erros de vínculos e duplicidade para informar o usuário.

## Vídeo Explicativo e Demonstrativo

O vídeo registra a demonstração original do projeto:

https://drive.google.com/file/d/1zP7U1b6AGS0YlKtMr7ON4dltovEF0fXE/view?usp=sharing
