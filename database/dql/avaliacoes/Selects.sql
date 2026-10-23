-- Lista todos os registros.
SELECT *
FROM avaliacoes;

-- Busca um registro pelo ID.
-- $1: idAvaliacao.
SELECT *
FROM avaliacoes
WHERE id_avaliacao = $1;

-- Filtra avaliações pela nota.
-- $1: nota.
SELECT *
FROM avaliacoes
WHERE nota = $1;

-- Filtra avaliações pelo status exato.
-- $1: status.
SELECT *
FROM avaliacoes
WHERE status = $1;

-- Busca registros por trecho de comentario, sem diferenciar maiúsculas e minúsculas.
-- $1: padrão de busca com % antes e depois de nome.
SELECT *
FROM avaliacoes
WHERE LOWER(comentario) LIKE LOWER($1);
