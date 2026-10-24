# Sistema Web de Gerenciamento de Jogos

Aplicação para gerenciar jogos, jogadores, plataformas e avaliações, com cadastro por pesquisa no IGDB, consultas SQL e dashboard analítico.

[Acessar demonstração](https://gametrail.noxlux.workers.dev/)

## Conteúdo

- [Visão geral e funcionalidades](#visão-geral-e-funcionalidades)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Arquitetura e integração com o Supabase](#arquitetura-e-integração-com-o-supabase)
- [Configuração e execução](#configuração-e-execução)
- [Cadastro de jogos com IGDB](#cadastro-de-jogos-com-igdb)
- [Cache Redis](#cache-redis)
- [Validações e testes](#validações-e-testes)
- [Tecnologias utilizadas](#tecnologias-utilizadas)
- [Vídeo explicativo e demonstrativo](#vídeo-explicativo-e-demonstrativo)

## Visão geral e funcionalidades

Após informar seu nome, o usuário acessa os cadastros, as consultas e o dashboard pelo menu lateral.

- **Cadastros:** criação, listagem, edição e exclusão de jogos, jogadores, plataformas e avaliações.
- **Jogos com capas:** busca no IGDB, seleção da versão e revisão dos dados antes de salvar, com cadastro manual como alternativa.
- **Dashboard:** totais, médias, distribuição por gênero, ranking de jogos, status das avaliações, notas e horas por jogador.
- **Consultas:** buscas, filtros, relacionamentos entre tabelas e agregações.

### Consultas e edição dos resultados

As consultas são organizadas por entidade e oferecem quatro modos:

| Modo | Operações |
| --- | --- |
| Simples | Listagem e busca por ID ou nome; nas avaliações, a busca textual usa o comentário. |
| Filtros | Gênero, ano, nickname, plataforma, nota ou status, conforme a tabela. |
| Joins | Cruzamento de jogos, jogadores, plataformas e avaliações. |
| Agregações | Totais, médias, agrupamentos, distribuição de notas e avaliações recentes. |

Resultados que representam registros individuais oferecem **Editar** e **Excluir**, reutilizando os formulários dos cadastros. Ao salvar, voltar ou excluir, os filtros são preservados e os resultados são atualizados. Em joins, as ações afetam a entidade da tabela selecionada; totais e médias não oferecem essas ações.

## Estrutura do projeto

```text
cloudflare/
  worker.js          # entrada HTTP e conexão Hyperdrive
  api.js             # CRUD, consultas e dashboard
  cache.js           # cache dos dados locais e invalidação
  redis.js           # conexão TCP/TLS com Redis Cloud
  igdb.js            # catálogo externo, OAuth e cache das pesquisas
  queries.json       # SQL utilizado nas consultas
  *.test.js          # testes de API, interface e integrações
frontend/
  app.js             # navegação e interação com a API
  validation.js      # regras compartilhadas com o backend
  index.html
  *.css
database/            # DDL, DML, DQL, views, functions e procedures em SQL
diagrama/            # diagrama entidade-relacionamento
scripts/
  check-deploy.js    # bloqueia deploy com ID provisório do Hyperdrive
wrangler.jsonc       # configuração do Worker e seus bindings
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

O catálogo SQL executado pela API é mantido em `cloudflare/queries.json`. Os arquivos de DML e DQL em `database` são exemplos comentados, não scripts de instalação: `$1`, `$2` e seguintes representam parâmetros. Em um driver PostgreSQL, envie os valores separadamente; no SQL Editor, substitua os parâmetros por valores SQL apropriados.

## Arquitetura e integração com o Supabase

O Supabase hospeda o PostgreSQL, responsável pelo armazenamento permanente e pelas regras relacionais do sistema. O frontend chama `/api/`; o Cloudflare Worker valida a operação, acessa o banco com o driver `pg` e devolve JSON. Os arquivos da interface são servidos por Static Assets.

Em produção, o binding `HYPERDRIVE` fornece a conexão e gerencia o pool de conexões de origem. As credenciais do PostgreSQL ficam no Hyperdrive, sem serem enviadas ao navegador. O acesso usa SQL diretamente, sem depender do SDK ou da API REST do Supabase.

Nas leituras de dashboard e consultas, o Worker pode reutilizar resultados do Redis após conferir a versão dos dados no PostgreSQL. A busca externa no IGDB utiliza uma rota própria e não precisa abrir uma conexão com o Supabase.

### Modelo de dados

| Entidade | Dados principais |
| --- | --- |
| Jogo | Nome, ano, desenvolvedora, gênero, ID do IGDB e URL da capa; os dois últimos são opcionais. |
| Jogador | Nickname, email e jogo associado. |
| Plataforma | Nome, horas jogadas, última sessão e jogador associado. |
| Avaliação | Nota, comentário, status, data, jogador e jogo associados. |

Os relacionamentos estão definidos em `database/ddl/01_schema.sql` e documentados em `diagrama/Diagrama Entidade-Relacionamento.pdf`.

### Estruturas SQL utilizadas

- **View `vw_resumo_jogos`:** resume a quantidade de avaliações e a média das notas por jogo.
- **Function `fn_media_jogo`:** calcula a média das notas de um jogo.
- **Procedure `pr_atualizar_status_avaliacao`:** atualiza o status pelo ID da avaliação. A API executa a edição e a chamada da procedure em uma transação com rollback em caso de falha.
- **Gatilhos de invalidação:** incrementam a versão dos dados após alterações nas quatro tabelas, inclusive pelo SQL Editor, para invalidar o cache.

O banco também aplica chaves estrangeiras, unicidade de email e restrições de valores.

## Configuração e execução

### Requisitos e banco

Instale Node.js 22+ e pnpm 11.25.0. Para executar a aplicação, é necessário um PostgreSQL/Supabase configurado; para publicar, uma conta Cloudflare com Hyperdrive. Redis Cloud e as credenciais Twitch habilitam o cache e a busca externa, respectivamente.

Em uma instalação nova, execute os scripts no SQL Editor do Supabase ou pelo `psql`, nesta ordem:

1. `database/ddl/01_schema.sql`
2. `database/ddl/02_cache.sql`
3. `database/ddl/03_igdb.sql`
4. `database/views/01_view_resumo_jogos.sql`
5. `database/functions/01_function_media_jogo.sql`
6. `database/procedure/01_procedure_atualizar_status_avaliacao.sql`

Em bancos existentes, aplique as migrações ainda não instaladas. `02_cache.sql` adiciona o controle de invalidação; `03_igdb.sql` adiciona os campos do catálogo e o índice de duplicidade, preservando os jogos já cadastrados.

## Cadastro de jogos com IGDB

O usuário pesquisa um nome com pelo menos três caracteres. Após uma pausa de 400 ms, ou pelo botão Pesquisar, a tela mostra até 12 resultados com capa, nome, ano e desenvolvedora. A seleção abre uma prévia editável; campos obrigatórios ausentes precisam ser completados antes de salvar. A falta de capa não impede o cadastro.

O backend confirma o ID externo e a capa no provedor. O índice único em `igdb_id` impede cadastrar o mesmo jogo duas vezes, inclusive em requisições concorrentes. Jogos manuais mantêm o ID externo nulo. Se o catálogo estiver indisponível, o cadastro manual continua acessível.

`cloudflare/igdb.js` obtém o token OAuth por `client_credentials`, reutiliza-o até perto da expiração e tenta renová-lo uma vez após uma resposta 401. O token permanece no backend e não é armazenado no Redis. O usuário final não precisa entrar na Twitch.

As rotas internas são `GET /api/catalogo/jogos?q=nome` e `GET /api/catalogo/jogos/{id}`; o cadastro definitivo usa `POST /api/jogos`. Falhas, timeouts e limites de requisições recebem mensagens controladas, sem tentativas repetidas após um erro 429.

O IGDB permite uso gratuito para projetos não comerciais; consulte suas [condições e documentação](https://api-docs.igdb.com/). A interface exibe o crédito do provedor.

## Cache Redis

### Onde é usado e por que foi escolhido

O Redis guarda resultados temporários de leituras recorrentes, reduzindo a repetição de consultas ao PostgreSQL e de buscas no IGDB. Seu armazenamento em memória, hashes e expiração automática permitem compartilhar o cache entre execuções do Worker e limitar a permanência dos dados. O Redis Cloud foi o provedor escolhido para o projeto, com plano gratuito.

A conexão fica em `cloudflare/redis.js`; o cache local é gerenciado por `cloudflare/cache.js` e as pesquisas externas por `cloudflare/igdb.js`. O cache pode melhorar o tempo de resposta, dependendo da reutilização dos resultados e da latência da conexão; o PostgreSQL continua sendo a fonte oficial dos dados.

| Uso | Conteúdo e limites | Invalidação |
| --- | --- | --- |
| Dashboard e consultas | JSON por combinação de parâmetros; grupo com duração de 60 segundos, até 128 entradas de 128 KiB. | Alterações nos dados locais invalidam a versão anterior. |
| Pesquisas e detalhes do IGDB | Grupo separado com duração de 15 minutos, até 128 entradas de 32 KiB. | Expiração; alterações locais não modificam o catálogo externo. |

Cadastros e leituras de registros para edição consultam diretamente o PostgreSQL. Resultados vazios também podem ser armazenados; respostas maiores que os limites são devolvidas sem armazenamento.

### Invalidação e disponibilidade

Após inserção, edição, exclusão ou `TRUNCATE`, os gatilhos incrementam a versão na mesma transação. O rollback desfaz também esse incremento. Depois de uma gravação pela API, o Worker apaga o grupo anterior do Redis; a próxima leitura reconstrói o cache sob a nova versão.

Uma nova leitura não reutiliza entradas de versões antigas, mesmo se a exclusão falhar ou uma leitura concorrente terminar depois da alteração. Alterações feitas diretamente no banco invalidam a versão; os grupos antigos são removidos pela expiração, que não é renovada a cada leitura.

Cada leitura com cache ainda faz uma consulta curta à versão no PostgreSQL, evitando repetir a consulta completa ou as nove consultas do dashboard. Se o Redis falhar ou a tabela de versão não existir, a aplicação atende pelo PostgreSQL. O cabeçalho `X-Cache` indica `HIT`, `MISS` ou `BYPASS`.

## Validações e testes

A função `validateRecord`, em `frontend/validation.js`, é compartilhada pelo navegador e pela API. Cadastros e edições pela listagem, pelas consultas ou pela seleção do IGDB seguem as mesmas regras:

- Campos obrigatórios, textos sem espaços nas extremidades e limites de tamanho compatíveis com o banco.
- Ano do jogo inteiro e maior que zero; horas jogadas não negativas.
- Notas entre 0 e 10, IDs positivos e datas válidas em `yyyy-MM-dd`.
- Email com formato válido e comentário da avaliação opcional.
- ID do IGDB positivo e URL de capa permitida.

A API valida os recursos e consultas permitidos e usa SQL parametrizado. O PostgreSQL verifica vínculos, unicidade e demais restrições; erros de duplicidade e relacionamentos são tratados pelo Worker.

```powershell
pnpm test
pnpm check
```

Os testes cobrem CRUD, consultas, dashboard, interface, validações compartilhadas, cache, rollback, protocolo Redis e integração IGDB simulada. Os testes SQL utilizam PostgreSQL em memória com PGlite, sem credenciais reais. `pnpm check` monta o pacote do Worker com `wrangler deploy --dry-run`, sem publicar.

## Tecnologias utilizadas

| Tecnologia | Papel no projeto |
| --- | --- |
| JavaScript, HTML e CSS | Interface e lógica do backend. |
| Cloudflare Workers e Static Assets | Execução da API e hospedagem do frontend. |
| Cloudflare Hyperdrive | Pool de conexões com o PostgreSQL do Supabase. |
| PostgreSQL / Supabase e driver `pg` | Persistência, consultas e regras relacionais. |
| Redis Cloud e `@redis/client` | Cache compartilhado por TCP, com TLS quando disponível. |
| IGDB e OAuth da Twitch | Catálogo de jogos, capas e autenticação da aplicação externa. |
| Node.js 22+, pnpm 11.25.0 e Wrangler | Desenvolvimento, dependências e deploy. |
| Node Test Runner e PGlite | Testes automatizados e PostgreSQL em memória. |

## Vídeo explicativo e demonstrativo

O vídeo registra a demonstração original do projeto:

[Assistir ao vídeo](https://drive.google.com/file/d/1zP7U1b6AGS0YlKtMr7ON4dltovEF0fXE/view?usp=sharing)
