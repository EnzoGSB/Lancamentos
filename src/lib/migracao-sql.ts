/** Scripts SQL para migrar o Tabelões para outro projeto Supabase via SQL Editor. */

export const MIGRACAO_TABELAS = [
  'processamentos_lancamentos',
  'lancamentos',
  'extracao_pdf_cache',
] as const

export const SQL_SCHEMA_DESTINO = `-- ============================================================
-- PASSO 1 — Projeto DESTINO (novo Supabase)
-- SQL Editor → New query → Run
-- Cria tabelas, índices e bucket de PDFs.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- processamentos_lancamentos (uploads / fila de extração)
CREATE TABLE IF NOT EXISTS public.processamentos_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  original_filename text,
  status text NOT NULL DEFAULT 'aguardando_preparacao',
  tipo text CHECK (tipo IS NULL OR tipo IN ('single', 'multi')),
  analise_ia jsonb,
  lancamentos_ai jsonb,
  resultado jsonb,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  content_hash text,
  page_count integer,
  extracao_checkpoint jsonb,
  CONSTRAINT processamentos_lancamentos_page_count_positive
    CHECK (page_count IS NULL OR page_count > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS processamentos_lancamentos_content_hash_unique
  ON public.processamentos_lancamentos (content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS processamentos_lancamentos_fila_page_count_idx
  ON public.processamentos_lancamentos (status, page_count, created_at)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS processamentos_lancamentos_aguardando_preparacao_idx
  ON public.processamentos_lancamentos (created_at)
  WHERE status = 'aguardando_preparacao';

-- lancamentos (catálogo de imóveis)
CREATE TABLE IF NOT EXISTS public.lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  construtora text NOT NULL,
  empreendimento text NOT NULL,
  endereco text,
  bairro text,
  data_entrega text,
  metragem text,
  tipologia text,
  unidade text,
  andar text,
  vagas text,
  valor_minimo numeric,
  valor_maximo numeric,
  desconto_margem text,
  mais_detalhes jsonb,
  processamento_id uuid REFERENCES public.processamentos_lancamentos (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lancamentos_processamento_id_idx
  ON public.lancamentos (processamento_id);

CREATE INDEX IF NOT EXISTS lancamentos_construtora_idx
  ON public.lancamentos (construtora);

CREATE INDEX IF NOT EXISTS lancamentos_empreendimento_idx
  ON public.lancamentos (empreendimento);

-- cache de extração por hash do PDF
CREATE TABLE IF NOT EXISTS public.extracao_pdf_cache (
  content_hash text PRIMARY KEY,
  pipeline_version text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('single', 'multi')),
  analise_ia jsonb NOT NULL,
  lancamentos_ai jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extracao_pdf_cache_pipeline_version_idx
  ON public.extracao_pdf_cache (pipeline_version);

-- Storage: bucket privado para PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdfs', 'pdfs', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Permissões básicas (app usa service_role no servidor)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
`

export const SQL_EXPORT_PROCESSAMENTOS = `-- ============================================================
-- PASSO 2A — Projeto ORIGEM (Supabase atual)
-- Gera INSERTs de processamentos_lancamentos.
-- Copie TODAS as linhas da coluna "insert_sql" e rode no DESTINO.
-- ============================================================

SELECT format(
  'INSERT INTO public.processamentos_lancamentos (id, storage_path, original_filename, status, tipo, analise_ia, lancamentos_ai, resultado, erro, created_at, updated_at, content_hash, page_count, extracao_checkpoint) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING;',
  quote_literal(id::text) || '::uuid',
  quote_nullable(storage_path),
  quote_nullable(original_filename),
  quote_literal(status),
  CASE WHEN tipo IS NULL THEN 'NULL' ELSE quote_literal(tipo) END,
  CASE WHEN analise_ia IS NULL THEN 'NULL' ELSE quote_literal(analise_ia::text) || '::jsonb' END,
  CASE WHEN lancamentos_ai IS NULL THEN 'NULL' ELSE quote_literal(lancamentos_ai::text) || '::jsonb' END,
  CASE WHEN resultado IS NULL THEN 'NULL' ELSE quote_literal(resultado::text) || '::jsonb' END,
  quote_nullable(erro),
  quote_literal(created_at::text) || '::timestamptz',
  quote_literal(updated_at::text) || '::timestamptz',
  quote_nullable(content_hash),
  CASE WHEN page_count IS NULL THEN 'NULL' ELSE page_count::text END,
  CASE WHEN extracao_checkpoint IS NULL THEN 'NULL' ELSE quote_literal(extracao_checkpoint::text) || '::jsonb' END
) AS insert_sql
FROM public.processamentos_lancamentos
ORDER BY created_at;
`

export const SQL_EXPORT_LANCAMENTOS = `-- ============================================================
-- PASSO 2B — Projeto ORIGEM
-- Gera INSERTs de lancamentos (rode DEPOIS dos processamentos).
-- ============================================================

SELECT format(
  'INSERT INTO public.lancamentos (id, construtora, empreendimento, endereco, bairro, data_entrega, metragem, tipologia, unidade, andar, vagas, valor_minimo, valor_maximo, desconto_margem, mais_detalhes, processamento_id, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING;',
  quote_literal(id::text) || '::uuid',
  quote_literal(construtora),
  quote_literal(empreendimento),
  quote_nullable(endereco),
  quote_nullable(bairro),
  quote_nullable(data_entrega),
  quote_nullable(metragem),
  quote_nullable(tipologia),
  quote_nullable(unidade),
  quote_nullable(andar),
  quote_nullable(vagas),
  CASE WHEN valor_minimo IS NULL THEN 'NULL' ELSE valor_minimo::text END,
  CASE WHEN valor_maximo IS NULL THEN 'NULL' ELSE valor_maximo::text END,
  quote_nullable(desconto_margem),
  CASE WHEN mais_detalhes IS NULL THEN 'NULL' ELSE quote_literal(mais_detalhes::text) || '::jsonb' END,
  CASE WHEN processamento_id IS NULL THEN 'NULL' ELSE quote_literal(processamento_id::text) || '::uuid' END,
  quote_literal(created_at::text) || '::timestamptz',
  quote_literal(updated_at::text) || '::timestamptz'
) AS insert_sql
FROM public.lancamentos
ORDER BY created_at;
`

export const SQL_EXPORT_CACHE = `-- ============================================================
-- PASSO 2C — Projeto ORIGEM (opcional)
-- Cache de extração — acelera reprocessamento de PDFs iguais.
-- ============================================================

SELECT format(
  'INSERT INTO public.extracao_pdf_cache (content_hash, pipeline_version, tipo, analise_ia, lancamentos_ai, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (content_hash) DO NOTHING;',
  quote_literal(content_hash),
  quote_literal(pipeline_version),
  quote_literal(tipo),
  quote_literal(analise_ia::text) || '::jsonb',
  quote_literal(lancamentos_ai::text) || '::jsonb',
  quote_literal(created_at::text) || '::timestamptz',
  quote_literal(updated_at::text) || '::timestamptz'
) AS insert_sql
FROM public.extracao_pdf_cache
ORDER BY created_at;
`

export const SQL_VALIDACAO_DESTINO = `-- ============================================================
-- PASSO 4 — Projeto DESTINO
-- Confira se os dados bateram com o projeto de origem.
-- ============================================================

SELECT 'processamentos_lancamentos' AS tabela, count(*)::bigint AS total
FROM public.processamentos_lancamentos
UNION ALL
SELECT 'lancamentos', count(*)::bigint FROM public.lancamentos
UNION ALL
SELECT 'extracao_pdf_cache', count(*)::bigint FROM public.extracao_pdf_cache
ORDER BY tabela;
`

export const SQL_LIMPAR_DESTINO = `-- ============================================================
-- CUIDADO — Projeto DESTINO
-- Apaga todos os dados (útil para refazer a migração).
-- NÃO rode no projeto de origem.
-- ============================================================

TRUNCATE public.lancamentos, public.extracao_pdf_cache, public.processamentos_lancamentos CASCADE;
`

export type MigracaoPasso = {
  id: string
  titulo: string
  descricao: string
  projeto: 'destino' | 'origem' | 'ambos'
  sql: string
  opcional?: boolean
}

export const MIGRACAO_PASSOS: MigracaoPasso[] = [
  {
    id: 'schema',
    titulo: '1. Criar schema no projeto destino',
    descricao:
      'Abra o SQL Editor do novo projeto Supabase e execute este script. Ele cria as três tabelas, índices e o bucket pdfs.',
    projeto: 'destino',
    sql: SQL_SCHEMA_DESTINO,
  },
  {
    id: 'export-processamentos',
    titulo: '2. Exportar processamentos (origem)',
    descricao:
      'No projeto ATUAL, rode a query abaixo. Copie cada linha da coluna insert_sql e cole numa nova query no projeto destino. Execute na ordem: processamentos → lançamentos → cache.',
    projeto: 'origem',
    sql: SQL_EXPORT_PROCESSAMENTOS,
  },
  {
    id: 'export-lancamentos',
    titulo: '3. Exportar lançamentos (origem)',
    descricao:
      'Mesmo procedimento: rode no origem, copie insert_sql, execute no destino. Só rode depois dos processamentos.',
    projeto: 'origem',
    sql: SQL_EXPORT_LANCAMENTOS,
  },
  {
    id: 'export-cache',
    titulo: '4. Exportar cache de extração (opcional)',
    descricao:
      'Opcional. Evita reprocessar PDFs já extraídos. Pode pular se preferir começar com cache vazio.',
    projeto: 'origem',
    sql: SQL_EXPORT_CACHE,
    opcional: true,
  },
  {
    id: 'validacao',
    titulo: '5. Validar contagens no destino',
    descricao:
      'Compare os totais com os números exibidos nesta página. processamentos_lancamentos, lancamentos e extracao_pdf_cache devem bater.',
    projeto: 'destino',
    sql: SQL_VALIDACAO_DESTINO,
  },
]
