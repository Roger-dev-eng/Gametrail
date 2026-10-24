# Sistema Web de Gerenciamento de Jogos

Aplicação JavaScript para gerenciar jogos, jogadores, plataformas e avaliações, com CRUD, consultas SQL e dashboard analítico. O mesmo backend Cloudflare Workers é usado localmente e em produção, com PostgreSQL do Supabase via Hyperdrive.

URL demo: https://gametrail.noxlux.workers.dev/

## Conteúdo

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Arquitetura](#arquitetura)
- [Integração com o Supabase](#integração-com-o-supabase)
- [Modelo de dados da aplicação](#modelo-de-dados-da-aplicação)
- [Requisitos](#requisitos)
- [Configuração do banco](#configuração-do-banco)
- [Aplicação web](#aplicação-web)
- [Fluxo da aplicação](#fluxo-da-aplicação)
- [Consultas disponíveis](#consultas-disponíveis)
- [Views, functions e procedures](#views-functions-e-procedures)
- [Validações implementadas](#validações-implementadas)
- [Testes e validação](#testes-e-validação)
- [Cache Redis](#cache-redis)
- [Por que o Redis foi escolhido](#por-que-o-redis-foi-escolhido)
- [Vídeo Explicativo e Demonstrativo](#vídeo-explicativo-e-demonstrativo)

## Visão geral

O sistema reúne identificação do usuário, menu principal, cadastros, consultas e dashboard em uma única interface. As operações são realizadas no PostgreSQL por uma API JavaScript, compartilhada entre desenvolvimento local e produção.

## Stack

- JavaScript, HTML e CSS.
- Cloudflare Workers, Static Assets e Hyperdrive.
- PostgreSQL / Supabase.
- Redis Cloud via TCP para cache de dashboard e consultas, com TLS opcional.
- Node.js 22+ e pnpm 11.25.0 para desenvolvimento, testes e deploy.

## Estrutura do projeto

```text
cloudflare/
  worker.js          # entrada HTTP e conexão Hyperdrive
  api.js             # CRUD, validações, consultas e dashboard
  cache.js           # cache Redis e invalidação por versão dos dados
  redis.js           # conexão TCP/TLS com Redis Cloud
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

A pasta `database` contém somente SQL comentado, organizado em DDL, DML, DQL, views, functions e procedures. A criação das tabelas está consolidada em `database/ddl/01_schema.sql`.O catálogo usado pela API é mantido diretamente em `cloudflare/queries.json`.

Os arquivos de DML e DQL são modelos de instruções parametrizadas PostgreSQL: `$1`, `$2` e assim por diante representam os valores descritos nos comentários. Para executar uma instrução no SQL Editor, substitua esses parâmetros por valores SQL apropriados; em um driver PostgreSQL, envie-os como parâmetros separados. Esses modelos não são scripts de instalação nem são executados automaticamente pela aplicação.

## Arquitetura

O frontend chama as rotas `/api/` do Worker. `cloudflare/worker.js` abre uma conexão PostgreSQL por requisição via Hyperdrive, encaminha as operações para `cloudflare/api.js` e encerra a conexão ao terminar. Static Assets serve o frontend.

## Integração com o Supabase

O Supabase hospeda o PostgreSQL responsável pelo armazenamento permanente do sistema. Nele ficam as tabelas de jogos, jogadores, plataformas e avaliações, seus relacionamentos e as estruturas SQL usadas nos indicadores. O PostgreSQL é a fonte oficial dos dados; o Redis armazena apenas cópias temporárias de resultados.

A integração é feita pelo backend no Cloudflare Workers com o driver `pg`. Em produção, o binding `HYPERDRIVE` fornece a conexão com o PostgreSQL do Supabase e gerencia o pool de conexões de origem. As credenciais são configuradas no Hyperdrive, sem serem enviadas ao navegador. No desenvolvimento local, a conexão é informada pela variável `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, em `.dev.vars`.

O fluxo de acesso segue estas etapas:

1. O frontend envia uma requisição para `/api/`.
2. O Worker valida os dados e identifica a operação solicitada.
3. O backend executa o SQL parametrizado no PostgreSQL do Supabase; nas leituras de dashboard e consultas, pode reutilizar o resultado do Redis após conferir a versão dos dados.
4. A resposta é devolvida em JSON para a interface.

O banco aplica chaves estrangeiras, unicidade de email e restrições de valores. O dashboard utiliza a view `vw_resumo_jogos` e a function `fn_media_jogo`; a edição de avaliações chama `pr_atualizar_status_avaliacao` em uma transação. Os gatilhos de `database/ddl/02_cache.sql` registram alterações para invalidar o cache, inclusive quando realizadas diretamente no Supabase.

Neste projeto, o acesso usa SQL pelo driver PostgreSQL, sem depender do SDK JavaScript do Supabase ou de sua API REST. O login por nome da interface não usa Supabase Auth e não constitui autenticação de usuários.

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
2. `database/ddl/02_cache.sql`
3. `database/views/01_view_resumo_jogos.sql`
4. `database/functions/01_function_media_jogo.sql`
5. `database/procedure/01_procedure_atualizar_status_avaliacao.sql`

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

Resultados que identificam registros individuais oferecem **Editar** e **Excluir**, usando os mesmos formulários dos cadastros. Ao salvar, voltar ou excluir, a tela mantém os filtros e atualiza os resultados. Em joins, as ações afetam a entidade da tabela selecionada. Totais, médias e demais resultados agrupados não oferecem essas ações.

## Views, functions e procedures

- `database/views/01_view_resumo_jogos.sql`: cria a view `vw_resumo_jogos`, com quantidade de avaliações e média das notas por jogo.
- `database/functions/01_function_media_jogo.sql`: cria a function `fn_media_jogo`, que calcula a média das notas de um jogo.
- `database/procedure/01_procedure_atualizar_status_avaliacao.sql`: cria a procedure `pr_atualizar_status_avaliacao`, que atualiza o status pelo ID da avaliação.

## Validações implementadas

As validações estão centralizadas em `frontend/validation.js`, na função `validateRecord`, importada tanto pelo frontend quanto pela API. Cadastros e edições (pela listagem ou pelas consultas) usam as mesmas regras. O formulário informa o erro e impede o envio; a API repete a validação para proteger acessos diretos.

As regras incluem:

- Campos obrigatórios e remoção de espaços nas extremidades dos textos.
- Números inteiros e limites permitidos.
- Notas entre 0 e 10.
- E-mail com formato válido e limites de tamanho de texto correspondentes ao banco.
- IDs de jogos e jogadores positivos.
- Datas válidas no formato `yyyy-MM-dd`.
- IDs, recursos e consultas permitidos pela API.

O PostgreSQL também aplica as restrições do esquema, como chaves estrangeiras e email único. O Worker trata os erros de vínculos e duplicidade para informar o usuário.

O comentário das avaliações é opcional nas duas formas de edição. Campos numéricos inteiros usam os mesmos limites no formulário e na API.

## Cache Redis

O dashboard (`GET /api/dashboard`) e as consultas (`GET /api/consultas`) usam Redis Cloud via TCP com o cliente oficial `@redis/client`. As opções de tabela, modo, consulta e parâmetro identificam cada resultado; combinações diferentes não compartilham a mesma entrada. Os cadastros e a leitura de registros para edição continuam consultando diretamente o PostgreSQL.

### Onde e como o Redis foi utilizado

A integração está dividida entre `cloudflare/redis.js`, que autentica e gerencia a conexão com o Redis Cloud, e `cloudflare/cache.js`, que consulta, armazena e invalida os resultados. O Worker chama essa camada antes de executar as rotas da API.

No dashboard, o cache guarda o JSON completo dos indicadores e gráficos, evitando repetir as nove consultas SQL a cada abertura. Na tela de consultas, guarda o JSON de cada combinação de tabela, modo, consulta e parâmetro, incluindo buscas, filtros, joins e agregações. Resultados vazios também podem ser armazenados.

As respostas ficam em hashes Redis agrupados pela versão dos dados. Cada resultado é identificado por um hash SHA-256 das opções da consulta. Quando existe uma entrada válida, ela é devolvida à interface; quando não existe, o backend consulta o Supabase e armazena o resultado para as próximas leituras.

### Invalidação e reconstrução

Após qualquer inserção, edição, exclusão ou `TRUNCATE` nas quatro tabelas, os gatilhos incrementam a versão dos dados na mesma transação. Isso também cobre alterações no SQL Editor e pela procedure. Um rollback desfaz tanto a alteração quanto a versão.

As entradas de dashboard e consultas ficam agrupadas pela versão. Após uma gravação bem-sucedida pela API, o Worker apaga o grupo anterior do Redis. A próxima leitura reconstrói o cache sob a nova versão. Versões antigas nunca são reutilizadas, mesmo se o Redis falhar durante a exclusão ou uma leitura concorrente terminar depois da alteração. Alterações externas invalidam a versão imediatamente; os grupos antigos são removidos pela expiração.

Cada grupo expira após **60 segundos**, com até 128 resultados de até 128 KiB cada. A expiração não é renovada a cada leitura. Valores maiores são retornados normalmente, sem armazenamento no Redis.

Se o Redis estiver indisponível ou atingir suas cotas, o Worker consulta o PostgreSQL. Uma leitura com cache ainda executa uma consulta curta para conferir a versão, mas evita repetir a consulta completa ou as nove consultas do dashboard. Sem a tabela de versão, o cache é desativado para evitar dados antigos.

## Por que o Redis foi escolhido

O Redis foi escolhido para reduzir a repetição de consultas ao PostgreSQL nas telas que fazem leituras recorrentes. O dashboard calcula vários indicadores, enquanto buscas e filtros podem ser executados repetidamente com os mesmos parâmetros. Guardar esses resultados temporariamente reduz o trabalho do banco e pode diminuir o tempo de resposta; o ganho depende da frequência de reutilização e da latência da conexão.

O armazenamento em memória, os hashes e a expiração automática permitem guardar JSON por consulta, agrupar os resultados para exclusão e limitar o tempo de vida das entradas. O Redis Cloud permite compartilhar o cache entre diferentes execuções do Worker, sem depender da memória de uma única instância da aplicação, e foi adotado por ser o provedor escolhido para o projeto, com opção de plano gratuito.

O cache complementa o Supabase: o PostgreSQL mantém a persistência, as regras relacionais e as transações. A conferência de versão e a invalidação após alterações impedem a reutilização de entradas de versões antigas. Caso o Redis falhe, a aplicação continua consultando o PostgreSQL.

## Vídeo Explicativo e Demonstrativo

O vídeo registra a demonstração original do projeto:

https://drive.google.com/file/d/1zP7U1b6AGS0YlKtMr7ON4dltovEF0fXE/view?usp=sharing
