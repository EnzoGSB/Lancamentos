-- Novo status intermediário: PDF enviado, aguardando o usuário remover páginas antes da fila.
-- Não há CHECK em status; a aplicação passa a usar 'aguardando_preparacao'.

CREATE INDEX IF NOT EXISTS processamentos_lancamentos_aguardando_preparacao_idx
  ON processamentos_lancamentos (created_at)
  WHERE status = 'aguardando_preparacao';
