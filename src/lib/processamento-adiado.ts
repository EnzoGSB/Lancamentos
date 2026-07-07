import type { SupabaseClient } from '@supabase/supabase-js'
import { STATUS_PROCESSAMENTO_OCUPADO } from '@/lib/fila-processamento'

export class ProcessamentoAdiadoError extends Error {
  constructor() {
    super('Processamento adiado pelo usuário')
    this.name = 'ProcessamentoAdiadoError'
  }
}

/** Status em que o usuário pode adiar e liberar o slot da fila. */
export const STATUS_ADIAVEL = [...STATUS_PROCESSAMENTO_OCUPADO] as const

export type ResultadoAdiarProcessamento =
  | { ok: true }
  | { ok: false; erro: string; notFound?: boolean; invalidStatus?: boolean }

/** Coloca o PDF no fim da fila, preservando análise e progresso parcial. */
export async function adiarProcessamentoNaFila(
  supabase: SupabaseClient,
  processamentoId: string
): Promise<ResultadoAdiarProcessamento> {
  const { data: proc, error: fetchError } = await supabase
    .from('processamentos_lancamentos')
    .select('id, status')
    .eq('id', processamentoId)
    .maybeSingle()

  if (fetchError) return { ok: false, erro: fetchError.message }
  if (!proc) return { ok: false, erro: 'Processamento não encontrado', notFound: true }

  if (!STATUS_ADIAVEL.includes(proc.status as (typeof STATUS_ADIAVEL)[number])) {
    return {
      ok: false,
      erro: `Não é possível adiar no status "${proc.status}".`,
      invalidStatus: true,
    }
  }

  const agora = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('processamentos_lancamentos')
    .update({
      status: 'adiado',
      erro: null,
      updated_at: agora,
    })
    .eq('id', processamentoId)
    .in('status', [...STATUS_ADIAVEL])
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, erro: error.message }
  if (!updated) {
    return {
      ok: false,
      erro: 'Processamento não está mais em andamento.',
      invalidStatus: true,
    }
  }

  return { ok: true }
}
