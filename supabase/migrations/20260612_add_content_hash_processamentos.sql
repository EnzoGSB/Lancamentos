-- Hash SHA-256 do conteúdo do PDF para impedir upload duplicado.
ALTER TABLE processamentos_lancamentos
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS processamentos_lancamentos_content_hash_unique
  ON processamentos_lancamentos (content_hash)
  WHERE content_hash IS NOT NULL;
