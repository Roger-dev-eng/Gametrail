# Sistema Web de Gerenciamento de Jogos

Aplicação web para gerenciamento e visualização analítica de jogos, jogadores, plataformas e avaliações, conectada ao PostgreSQL do Supabase. O deploy usa Cloudflare Workers com Static Assets e Hyperdrive, disponíveis no plano gratuito. O backend Java/JDBC continua disponível para execução local.

O site reúne login simples por nome (sem autenticação), operações CRUD, consultas SQL, joins, agregações e dashboard analítico em uma única interface. A API de produção está em `cloudflare/`; o frontend usa as mesmas rotas `/api/` nas duas implementações.

- URL após publicar: `https://jogos-dashboard.<seu-subdominio>.workers.dev`.

## Conteúdo

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Arquitetura](#arquitetura)
- [Modelo de dados da aplicação](#modelo-de-dados-da-aplicação)
- [Requisitos](#requisitos)
- [Configuração do banco](#configuração-do-banco)
- [Como compilar e executar](#como-compilar-e-executar)
- [Aplicação web](#aplicação-web)
- [Supabase e deploy na Cloudflare](#supabase-e-deploy-na-cloudflare)
- [Fluxo da aplicação](#fluxo-da-aplicação)
- [Consultas disponíveis](#consultas-disponíveis)
- [Views, functions e procedures](#views-functions-e-procedures)
- [Validações implementadas](#validações-implementadas)
- [Vídeo Explicativo e Demonstrativo](#vídeo-explicativo-e-demonstrativo)

## Visão geral

O sistema oferece:

- login simples com identificação do usuário
- menu principal para navegação entre módulos
- CRUD de jogos
- CRUD de jogadores
- CRUD de plataformas
- CRUD de avaliações
- tela de consultas com listagens, filtros, joins e agregações
- dashboard web com KPIs, filtros dinâmicos e gráficos analíticos

## Stack
- Cloudflare Workers, Static Assets e Hyperdrive (deploy)
- Node.js 22+ e pnpm (ferramentas de deploy)
- Java 21
- Maven
- Java HTTP Server
- JDBC
- PostgreSQL / Supabase
- HTML, CSS e JavaScript
- Docker

## Estrutura do projeto

```text
diagrama/
  Diagrama Entidade-Relacionamento.pdf
src/
  MenuPrincipal.java
  
  app/
    db/
      Database.java
    web/
      WebServer.java
      WebCrudService.java
      WebQueryService.java
    model/
      Jogo.java
      Jogador.java
      Plataforma.java
      Avaliacao.java
    repository/
      JogoRepository.java
      JogadorRepository.java
      PlataformaRepository.java
      AvaliacaoRepository.java
    service/
      ConsultaResultado.java
      ConsultaService.java
    validation/
      Validator.java
      ValidationException.java
frontend/
  index.html
  app.js
  styles.css
  overview.css
Dockerfile                 # execução Java local opcional
wrangler.jsonc             # deploy Cloudflare
cloudflare/
  worker.js                # entrada do Worker e conexão Hyperdrive
  api.js                   # CRUD, consultas e dashboard
  queries.json             # SQL extraído das classes DQL Java
scripts/
  generate-queries.js
database/
  ddl/
    01_schema.sql
  dml/
    Insert.java
    Update.java
    Delete.java
  dql/
    jogos/
    jogadores/
    plataformas/
    avaliacoes/
  views/
    01_view_resumo_jogos.sql
  functions/
    01_function_media_jogo.sql
  procedure/
    01_procedure_atualizar_status_avaliacao.sql
```

## Arquitetura

O código está organizado em camadas e módulos com responsabilidades bem definidas. A ideia central é separar interface, regras de aplicação, validação e acesso ao banco para reduzir acoplamento e facilitar manutenção.

- `app.web`: expõe o backend HTTP Java, integra o frontend e encaminha CRUDs e consultas para as camadas da aplicação.
- `app.model`: define as entidades de domínio usadas no sistema, como `Jogo`, `Jogador`, `Plataforma` e `Avaliacao`. Essas classes representam os dados de forma tipada e ajudam a evitar manipulação solta de valores pela aplicação.
- `app.repository`: cada repositório organiza operações de leitura e escrita para um tipo de dado específico e faz a ponte entre a aplicação e as classes SQL reutilizadas.
- `app.service`: reúne regras mais voltadas ao comportamento da aplicação, especialmente na composição e execução das consultas avançadas.
- `app.validation`: centraliza validações reutilizáveis de entrada, como obrigatoriedade, conversão numérica, datas e faixas permitidas.
- `app.db`: encapsula a criação da conexão JDBC com o PostgreSQL a partir das variáveis de ambiente.
- `ddl`: concentra a definição estrutural do banco, isto é, os elementos responsáveis pela criação das tabelas.
- `dml`: reúne as instruções de manipulação de dados, como inserções, atualizações e exclusões.
- `dql`: reúne as consultas SQL usadas para leitura de dados.
- `database/views`: contém views de leitura reutilizáveis pela aplicação e pelo dashboard.
- `database/functions`: contém functions PostgreSQL que retornam um valor e podem ser usadas em `SELECT`.
- `database/procedure`: contém procedures PostgreSQL para operações que alteram dados e são executadas com `CALL`.
- `frontend`: contém a interface web atual, incluindo login, menu principal, cadastros, consultas e dashboard.

## Modelo de dados da aplicação

As entidades centrais do sistema são:

- `Jogo`: nome, ano de lançamento, desenvolvedora e gênero
- `Jogador`: nickname, email e jogo associado
- `Plataforma`: nome, horas jogadas, última sessão e jogador associado
- `Avaliacao`: nota, comentário, status, data, jogador e jogo associados

## Requisitos

- JDK 21 ou superior
- Maven 3.9 ou superior
- Docker, opcional para executar a versão Java
- Node.js 22+ e pnpm, para desenvolver e publicar a versão Cloudflare
- um projeto PostgreSQL/Supabase
- variáveis de ambiente configuradas para acesso ao banco

O `pom.xml` está configurado com Java 21:

```xml
<maven.compiler.release>21</maven.compiler.release>
```


## Configuração do banco

Defina as variáveis de ambiente antes da execução:

```powershell
$env:DB_URL="jdbc:postgresql://localhost:5432/seu_banco"
$env:DB_USER="seu_usuario"
$env:DB_PASSWORD="sua_senha"
```

A conexão JDBC é centralizada em [src/app/db/Database.java](src/app/db/Database.java).

Para usar o Supabase, copie a connection string do painel `Connect`. O backend aceita uma URL única:

```powershell
$env:SUPABASE_DB_URL="postgresql://postgres.seu_projeto:SUA_SENHA@aws-0-regiao.pooler.supabase.com:6543/postgres?sslmode=require"
```

Também é possível usar separadamente `DB_URL`, `DB_USER` e `DB_PASSWORD`. Configure as variáveis na mesma sessão do terminal que iniciará o Java.

## Como compilar e executar

### Compilação com Maven

```powershell
mvn package -DskipTests dependency:copy-dependencies -DoutputDirectory=target/dependency
```

### Executar o site

## Aplicação web


O site reúne a navegação operacional e analítica em uma única aplicação web. Na Cloudflare, `cloudflare/worker.js` serve a API e Static Assets serve o frontend; na execução Java local, `app.web.WebServer` atende ambos.

### Arquivos da aplicação web

- `src/app/web/WebServer.java`: servidor HTTP Java e API JDBC
- `src/app/web/WebCrudService.java`: CRUD usando models, repositories, validações e DML
- `src/app/web/WebQueryService.java`: consultas usando `ConsultaService` e DQL
- `frontend/index.html`: frontend web
- `frontend/app.js`: navegação, CRUD, consultas e dashboard
- `frontend/styles.css`: identidade visual responsiva

### Funcionalidades do site

- login simples por nome
- CRUD de jogos, jogadores, plataformas e avaliações
- consultas simples, filtros, joins e agregações
- KPIs com quantidade de jogos, jogadores cadastrados, média geral das notas e plataforma mais usada
- ranking de jogos por volume de avaliações usando a view `vw_resumo_jogos`
- média geral usando a function `fn_media_jogo`
- atualização de status usando a procedure `pr_atualizar_status_avaliacao`

### Como executar localmente

Compile o backend Java:

```powershell
mvn clean package -DskipTests dependency:copy-dependencies -DoutputDirectory=target/dependency
```

Depois execute o site:

```powershell
java -cp ".\target\classes;.\target\dependency\*" app.web.WebServer
```

### Observações importantes

- o site usa o banco PostgreSQL do Supabase
- a versão Java aceita `SUPABASE_DB_URL` ou `DB_URL`, `DB_USER` e `DB_PASSWORD`
- a versão Java lê `PORT` e usa `8080` por padrão
- em produção, a Cloudflare serve o frontend e executa a API JavaScript do Worker

## Supabase e deploy na Cloudflare

O Workers não executa a JVM nem o Dockerfile. Por isso, `cloudflare/api.js` implementa a API equivalente em JavaScript, com PostgreSQL via Hyperdrive. O banco existente, suas tabelas, view, function e procedure são preservados. Não é necessário migrar dados para D1.

### Publicar

1. Mantenha a conta Cloudflare no **Workers Free** e o projeto Supabase no plano **Free**. Não ative Workers Paid nem complementos pagos.
2. No Supabase, execute os scripts da seção [Views, functions e procedures](#views-functions-e-procedures), caso ainda não estejam instalados.
3. No painel Cloudflare, crie uma configuração **Hyperdrive** para o PostgreSQL existente. Informe host, porta, banco, usuário e senha pelos campos protegidos do painel. Use a conexão direta suportada pelo provedor ou o pooler em modo **Session** do Supabase; habilite TLS na conexão de origem. **Desative o query cache**: o CRUD precisa ler imediatamente as alterações realizadas.
4. Copie o ID dessa configuração para `hyperdrive[0].id` em `wrangler.jsonc`, substituindo os zeros. O ID não é segredo; a senha fica no Hyperdrive, nunca no frontend nem no Git.
5. Instale as dependências e autentique o Wrangler:

```powershell
pnpm install --frozen-lockfile
pnpm exec wrangler login
```

6. Valide e publique:

```powershell
pnpm test
pnpm check
pnpm deploy
```

O comando informa a URL `workers.dev`, com HTTPS e sem necessidade de comprar domínio. Para deploy pelo Git, conecte o repositório em **Workers & Pages > Create > Import a repository**, use a raiz do projeto, `pnpm install --frozen-lockfile` para instalar e `pnpm deploy` para publicar. Configure o Hyperdrive antes do primeiro deploy. A configuração do Render foi removida.

### Desenvolver o Worker localmente

Crie `.dev.vars` (ignorado pelo Git) com a conexão de desenvolvimento, sem o prefixo JDBC:

```dotenv
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://usuario:senha@host:5432/postgres?sslmode=require"
```

Execute `pnpm dev` e abra o endereço exibido pelo Wrangler. Essa variável é usada somente na emulação local; a produção usa o binding Hyperdrive. Para atualizar o catálogo após alterar o SQL DQL Java, execute `pnpm generate:queries` e versione `cloudflare/queries.json`.

### Limites gratuitos

- [Workers Free](https://developers.cloudflare.com/workers/platform/limits/): 100 mil requisições dinâmicas por dia e 10 ms de CPU por execução. Tempo aguardando o banco não conta como CPU.
- [Static Assets](https://developers.cloudflare.com/workers/platform/pricing/): requisições de arquivos estáticos gratuitas e ilimitadas; apenas `/api/*` passa primeiro pelo Worker.
- [Hyperdrive Free](https://developers.cloudflare.com/hyperdrive/platform/pricing/): 100 mil instruções SQL por dia. O dashboard executa nove consultas por abertura; transações também consomem a cota.
- O Supabase tem cotas e regras próprias do plano Free. O banco continua hospedado nele.

No Workers Free, ultrapassar a cota causa falha nas operações, sem cobrança automática por excedentes. Não faça upgrade para manter o requisito de gratuidade. Os arquivos do projeto não alteram o plano de cobrança da conta. A publicação precisa ser feita em uma conta configurada no Free.

## Fluxo da aplicação

1. O usuário acessa a tela de login.

2. O menu principal libera acesso aos módulos.

3. O botão `Dashboard` também permite abrir a visualização web analítica do sistema.

4. Cada tela operacional realiza consultas e operações CRUD no banco.

5. A opção `Consultas` permite executar consultas simples e avançadas.


## Consultas disponíveis

Na página `Consultas`, o usuário pode alternar entre quatro modos:

- `Simples`: listagem geral e busca por ID
- `Filtros`: filtros por campos específicos
- `Joins`: cruzamento de dados entre tabelas relacionadas
- `Agregacoes`: totais, médias e outras métricas

Na versão Java, as consultas são encaminhadas por `WebQueryService` para `ConsultaService`, que utiliza as classes DQL de `database/dql`. No Worker, `cloudflare/api.js` usa o SQL equivalente de `cloudflare/queries.json`, gerado dessas mesmas classes.

## Views, functions e procedures

Os scripts ficam separados por responsabilidade e devem ser executados nesta ordem:

1. `database/ddl/01_schema.sql`
2. `database/views/01_view_resumo_jogos.sql`
3. `database/functions/01_function_media_jogo.sql`
4. `database/procedure/01_procedure_atualizar_status_avaliacao.sql`

Com o PostgreSQL configurado, eles podem ser aplicados pelo `psql` na ordem acima. Ajuste o banco e o host conforme o seu ambiente:

```powershell
psql -h localhost -U $env:DB_USER -d seu_banco -f .\database\ddl\01_schema.sql
psql -h localhost -U $env:DB_USER -d seu_banco -f .\database\views\01_view_resumo_jogos.sql
psql -h localhost -U $env:DB_USER -d seu_banco -f .\database\functions\01_function_media_jogo.sql
psql -h localhost -U $env:DB_USER -d seu_banco -f .\database\procedure\01_procedure_atualizar_status_avaliacao.sql
```

Exemplos de uso após a instalação:

```sql
SELECT * FROM vw_resumo_jogos ORDER BY media_nota DESC;
SELECT fn_media_jogo(1);
CALL pr_atualizar_status_avaliacao(1, 'Aprovada');
```

As duas APIs usam a view e a function no dashboard. Ao atualizar uma avaliação, a procedure é chamada pelo `WebCrudService` na versão Java e por `cloudflare/api.js` no Worker (em uma transação com rollback em caso de falha).

## Validações implementadas

O projeto possui validações reutilizáveis para:

- campos obrigatórios
- conversão de número inteiro
- conversão de data no formato `yyyy-MM-dd`
- validação de faixa numérica

Essas regras estão centralizadas em `app.validation.Validator`.

## Vídeo Explicativo e Demonstrativo
https://drive.google.com/file/d/1zP7U1b6AGS0YlKtMr7ON4dltovEF0fXE/view?usp=sharing
