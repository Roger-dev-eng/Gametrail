-- Relaciona plataformas, horas jogadas, jogadores e seus jogos.
SELECT p.id_plataforma, p.nome AS plataforma_nome, p.horas_jogadas, jg.nickname, j.nome AS jogo_nome, j.genero
FROM plataformas p
INNER JOIN jogadores jg ON p.fk_jogador = jg.id_jogador
INNER JOIN jogos j ON jg.fk_jogo = j.id_jogo;
