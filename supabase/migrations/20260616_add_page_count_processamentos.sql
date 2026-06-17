-- Número de páginas do PDF para priorizar a fila (menos páginas primeiro).
ALTER TABLE processamentos_lancamentos
  ADD COLUMN IF NOT EXISTS page_count integer;

ALTER TABLE processamentos_lancamentos
  DROP CONSTRAINT IF EXISTS processamentos_lancamentos_page_count_positive;

ALTER TABLE processamentos_lancamentos
  ADD CONSTRAINT processamentos_lancamentos_page_count_positive
  CHECK (page_count IS NULL OR page_count > 0);

CREATE INDEX IF NOT EXISTS processamentos_lancamentos_fila_page_count_idx
  ON processamentos_lancamentos (status, page_count, created_at)
  WHERE status = 'pendente';
