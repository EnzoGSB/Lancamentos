import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { apagarExtracaoCache } from '@/lib/extracao-cache'

/**
 * Remove o cache de extração só deste PDF (chamada explícita).
 * Não é acionado automaticamente em upload nem em delete.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: proc, error: procError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, original_filename, content_hash')
    .eq('id', id)
    .maybeSingle()

  if (procError) {
    return NextResponse.json({ error: procError.message }, { status: 500 })
  }

  if (!proc) {
    return NextResponse.json({ error: 'Processamento não encontrado' }, { status: 404 })
  }

  if (!proc.content_hash) {
    return NextResponse.json({
      ok: true,
      removed: false,
      message: 'Este processamento não tem content_hash — nada a apagar no cache.',
    })
  }

  try {
    const { removed } = await apagarExtracaoCache(supabaseAdmin, proc.content_hash)
    return NextResponse.json({
      ok: true,
      removed,
      content_hash: proc.content_hash,
      arquivo: proc.original_filename,
      message: removed
        ? 'Cache de extração removido para este PDF.'
        : 'Não havia cache salvo para este PDF.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao apagar cache'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
