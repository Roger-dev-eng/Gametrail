-- Adiciona a identificação do IGDB e a URL da capa sem alterar os jogos já cadastrados.
ALTER TABLE jogos ADD COLUMN IF NOT EXISTS igdb_id INTEGER CHECK (igdb_id > 0);
ALTER TABLE jogos ADD COLUMN IF NOT EXISTS capa_url TEXT;

-- Impede cadastrar o mesmo jogo do catálogo duas vezes; jogos manuais podem ter ID externo nulo.
CREATE UNIQUE INDEX IF NOT EXISTS jogos_igdb_id_unique ON jogos (igdb_id) WHERE igdb_id IS NOT NULL;
