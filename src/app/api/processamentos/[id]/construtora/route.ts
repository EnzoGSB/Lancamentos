import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AnaliseIA, LancamentoAI } from '@/lib/types'
import { analiseSemConstrutora } from '@/lib/construtora-processamento'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const nome = (body.construtora as string | undefined)?.trim()

  if (!nome) {
    return NextResponse.json({ error: 'Informe o nome da construtora.' }, { status: 400 })
  }

  const { data: proc, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, status, analise_ia, lancamentos_ai')
    .eq('id', id)
    .single()

  if (error || !proc) {
    return NextResponse.json({ error: 'Processamento não encontrado' }, { status: 404 })
  }

  const analiseAtual = (proc.analise_ia ?? {
    tipo: 'multi',
    construtora: '',
    empreendimentos_identificados: [],
    resumo: '',
  }) as AnaliseIA

  const analiseNova: AnaliseIA = {
    ...analiseAtual,
    construtora: nome,
  }

  const patch: {
    analise_ia: AnaliseIA
    lancamentos_ai?: { lancamentos: LancamentoAI[] }
  } = { analise_ia: analiseNova }

  if (proc.status === 'aguardando_confirmacao' && proc.lancamentos_ai) {
    const payload = proc.lancamentos_ai as { lancamentos?: LancamentoAI[] }
    if (payload.lancamentos?.length) {
      patch.lancamentos_ai = {
        lancamentos: payload.lancamentos.map(l => ({
          ...l,
          construtora: analiseSemConstrutora(l.construtora) ? nome : l.construtora,
        })),
      }
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .update(patch)
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (proc.status === 'concluido') {
    await supabaseAdmin
      .from('lancamentos')
      .update({ construtora: nome })
      .eq('processamento_id', id)
  }

  return NextResponse.json({
    ok: true,
    id,
    construtora: nome,
    analise_ia: analiseNova,
  })
}
