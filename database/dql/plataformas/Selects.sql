-- Lista todos os registros.
SELECT *
FROM plataformas;

-- Busca um registro pelo ID.
-- $1: idPlataforma.
SELECT *
FROM plataformas
WHERE id_plataforma = $1;

-- Filtra plataformas por trecho do nome.
-- $1: padrão de busca com % antes e depois de nome.
SELECT *
FROM plataformas
WHERE nome LIKE $1;

-- Busca registros por trecho de nome, sem diferenciar maiúsculas e minúsculas.
-- $1: padrão de busca com % antes e depois de nome.
SELECT *
FROM plataformas
WHERE LOWER(nome) LIKE LOWER($1);
