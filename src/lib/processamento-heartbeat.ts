import type { SupabaseClient } from '@supabase/supabase-js'

const INTERVALO_MS = 2 * 60 * 1000

function patchUpdatedAt() {
  return { updated_at: new Date().toISOString() }
}

/** Mantém updated_at vivo durante extrações longas (evita falso "fantasma"). */
export function iniciarHeartbeatProcessamento(
  supabase: SupabaseClient,
  processamentoId: string
): () => void {
  const tick = () => {
    void supabase
      .from('processamentos_lancamentos')
      .update(patchUpdatedAt())
      .eq('id', processamentoId)
  }

  tick()
  const id = setInterval(tick, INTERVALO_MS)
  return () => clearInterval(id)
}
