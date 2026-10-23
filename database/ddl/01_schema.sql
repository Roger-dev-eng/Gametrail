-- Cria as tabelas de jogos, jogadores, plataformas e avaliações, com suas chaves e restrições.
CREATE TABLE IF NOT EXISTS jogos (
    id_jogo SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    ano_lancamento INTEGER,
    desenvolvedora VARCHAR(100),
    genero VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS jogadores (
    id_jogador SERIAL PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE,
    fk_jogo INTEGER REFERENCES jogos(id_jogo)
);

CREATE TABLE IF NOT EXISTS plataformas (
    id_plataforma SERIAL PRIMARY KEY,
    nome VARCHAR(50),
    horas_jogadas INTEGER,
    ultima_sessao TIMESTAMP,
    fk_jogador INTEGER REFERENCES jogadores(id_jogador)
);

CREATE TABLE IF NOT EXISTS avaliacoes (
    id_avaliacao SERIAL PRIMARY KEY,
    nota INTEGER CHECK (nota >= 0 AND nota <= 10),
    comentario TEXT,
    status VARCHAR(20),
    data_avaliacao DATE,
    fk_jogador INTEGER REFERENCES jogadores(id_jogador),
    fk_jogo INTEGER REFERENCES jogos(id_jogo)
);