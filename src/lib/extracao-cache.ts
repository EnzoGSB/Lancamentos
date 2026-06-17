import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnaliseIA, LancamentoAI } from './types'

/** Incremente ao mudar regras de extração/pós-processamento que invalidem cache antigo. */
export const EXTRACAO_CACHE_VERSION =
  process.env.EXTRACTION_CACHE_VERSION?.trim() || '2'

export type ExtracaoCacheHit = {
  tipo: 'single' | 'multi'
  analise_ia: AnaliseIA
  lancamentos: LancamentoAI[]
}

export async function buscarExtracaoCache(
  supabase: SupabaseClient,
  contentHash: string
): Promise<ExtracaoCacheHit | null> {
  if (!contentHash.trim()) return null

  const { data, error } = await supabase
    .from('extracao_pdf_cache')
    .select('pipeline_version, tipo, analise_ia, lancamentos_ai')
    .eq('content_hash', contentHash)
    .maybeSingle()

  if (error) {
    console.warn('[extracao-cache] lookup ignorado:', error.message)
    return null
  }

  if (!data || data.pipeline_version !== EXTRACAO_CACHE_VERSION) return null

  const payload = data.lancamentos_ai as { lancamentos?: LancamentoAI[] } | null
  const lancamentos = Array.isArray(payload?.lancamentos) ? payload.lancamentos : null
  if (!lancamentos?.length) return null

  return {
    tipo: data.tipo as 'single' | 'multi',
    analise_ia: data.analise_ia as AnaliseIA,
    lancamentos,
  }
}

export async function salvarExtracaoCache(
  supabase: SupabaseClient,
  contentHash: string,
  analise: AnaliseIA,
  lancamentos: LancamentoAI[]
): Promise<void> {
  if (!contentHash.trim() || lancamentos.length === 0) return

  const { error } = await supabase.from('extracao_pdf_cache').upsert(
    {
      content_hash: contentHash,
      pipeline_version: EXTRACAO_CACHE_VERSION,
      tipo: analise.tipo,
      analise_ia: analise,
      lancamentos_ai: { lancamentos },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'content_hash' }
  )

  if (error) {
    console.warn('[extracao-cache] falha ao salvar:', error.message)
  }
}

/** Remove cache de extração de um PDF (uso pontual — não altera o comportamento padrão). */
export async function apagarExtracaoCache(
  supabase: SupabaseClient,
  contentHash: string
): Promise<{ removed: boolean }> {
  if (!contentHash.trim()) return { removed: false }

  const { data, error } = await supabase
    .from('extracao_pdf_cache')
    .delete()
    .eq('content_hash', contentHash)
    .select('content_hash')
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return { removed: data != null }
}
