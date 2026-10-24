-- Registra a versão dos dados para invalidar o cache Redis, inclusive após alterações feitas diretamente no banco.
CREATE TABLE IF NOT EXISTS app_cache_revision (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision BIGINT NOT NULL DEFAULT 0
);

-- Inicializa o contador sem sobrescrever a versão de uma instalação existente.
INSERT INTO app_cache_revision (id, revision) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Incrementa a versão na mesma transação da alteração; rollback também desfaz o incremento.
CREATE OR REPLACE FUNCTION fn_invalidar_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE app_cache_revision SET revision = revision + 1 WHERE id = 1;
    RETURN NULL;
END;
$$;

-- Invalida dashboard e consultas após inserções, atualizações, exclusões ou limpeza de jogos.
DROP TRIGGER IF EXISTS invalidar_cache ON jogos;
CREATE TRIGGER invalidar_cache AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON jogos FOR EACH STATEMENT EXECUTE FUNCTION fn_invalidar_cache();

-- Invalida o cache após alterações nos jogadores.
DROP TRIGGER IF EXISTS invalidar_cache ON jogadores;
CREATE TRIGGER invalidar_cache AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON jogadores FOR EACH STATEMENT EXECUTE FUNCTION fn_invalidar_cache();

-- Invalida o cache após alterações nas plataformas.
DROP TRIGGER IF EXISTS invalidar_cache ON plataformas;
CREATE TRIGGER invalidar_cache AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON plataformas FOR EACH STATEMENT EXECUTE FUNCTION fn_invalidar_cache();

-- Invalida o cache após alterações nas avaliações, incluindo as feitas pela procedure.
DROP TRIGGER IF EXISTS invalidar_cache ON avaliacoes;
CREATE TRIGGER invalidar_cache AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON avaliacoes FOR EACH STATEMENT EXECUTE FUNCTION fn_invalidar_cache();
