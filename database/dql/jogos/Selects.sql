-- Lista todos os registros.
SELECT *
FROM jogos;

-- Busca um registro pelo ID.
-- $1: idJogo.
SELECT *
FROM jogos
WHERE id_jogo = $1;

-- Filtra jogos pelo gênero exato.
-- $1: genero.
SELECT *
FROM jogos
WHERE genero = $1;

-- Filtra jogos pelo ano de lançamento.
-- $1: ano.
SELECT *
FROM jogos
WHERE ano_lancamento = $1;

-- Busca registros por trecho de nome, sem diferenciar maiúsculas e minúsculas.
-- $1: padrão de busca com % antes e depois de nome.
SELECT *
FROM jogos
WHERE LOWER(nome) LIKE LOWER($1);
