-- Lista todos os registros.
SELECT *
FROM jogadores;

-- Busca um registro pelo ID.
-- $1: idJogador.
SELECT *
FROM jogadores
WHERE id_jogador = $1;

-- Busca jogadores por trecho do nickname.
-- $1: padrão de busca com % antes e depois de nickname.
SELECT *
FROM jogadores
WHERE nickname LIKE $1;

-- Busca registros por trecho de nickname, sem diferenciar maiúsculas e minúsculas.
-- $1: padrão de busca com % antes e depois de nome.
SELECT *
FROM jogadores
WHERE LOWER(nickname) LIKE LOWER($1);
