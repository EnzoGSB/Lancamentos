-- Cache de extração por hash do PDF (reutiliza resultado sem chamar IA de novo).
CREATE TABLE IF NOT EXISTS extracao_pdf_cache (
  content_hash text PRIMARY KEY,
  pipeline_version text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('single', 'multi')),
  analise_ia jsonb NOT NULL,
  lancamentos_ai jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extracao_pdf_cache_pipeline_version_idx
  ON extracao_pdf_cache (pipeline_version);
