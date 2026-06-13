import type { SupabaseClient } from '@supabase/supabase-js'

export class ProcessamentoCanceladoError extends Error {
  constructor() {
    super('Processamento cancelado pelo usuário')
    this.name = 'ProcessamentoCanceladoError'
  }
}

/** Status em que apagar deve interromper o fluxo em andamento. */
export const STATUS_CANCELAVEL = ['extraindo', 'analisando', 'processando', 'salvando'] as const

export async function verificarProcessamentoAtivo(
  supabase: SupabaseClient,
  processamentoId: string
): Promise<void> {
  const { data } = await supabase
    .from('processamentos_lancamentos')
    .select('status')
    .eq('id', processamentoId)
    .maybeSingle()

  if (!data || data.status === 'cancelado') {
    throw new ProcessamentoCanceladoError()
  }
}

export async function finalizarProcessamentoCancelado(
  supabase: SupabaseClient,
  processamentoId: string
): Promise<void> {
  await supabase
    .from('processamentos_lancamentos')
    .delete()
    .eq('id', processamentoId)
}
