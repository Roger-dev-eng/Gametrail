-- Relaciona jogos aos jogadores associados.
SELECT j.id_jogo, j.nome, j.genero, jg.id_jogador, jg.nickname
FROM jogos j
INNER JOIN jogadores jg ON j.id_jogo = jg.fk_jogo;
