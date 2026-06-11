import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { LancamentoAI } from '@/lib/types'

function limparLancamento(raw: LancamentoAI, processamentoId: string) {
  return {
    construtora: raw.construtora ?? 'Não informada',
    empreendimento: raw.empreendimento ?? 'Não informado',
    endereco: raw.endereco ?? null,
    bairro: raw.bairro ?? null,
    data_entrega: raw.data_entrega ?? null,
    metragem: raw.metragem ?? null,
    tipologia: raw.tipologia ?? null,
    unidade: raw.unidade ?? null,
    andar: raw.andar ?? null,
    vagas: raw.vagas ?? null,
    unidades: raw.unidades != null ? Math.round(Number(raw.unidades)) || null : null,
    valor_minimo: raw.valor_minimo != null ? Number(raw.valor_minimo) || null : null,
    valor_maximo: raw.valor_maximo != null ? Number(raw.valor_maximo) || null : null,
    desconto_margem: raw.desconto_margem ?? null,
    mais_detalhes: raw.mais_detalhes ?? null,
    processamento_id: processamentoId,
  }
}

export async function POST(request: NextRequest) {
  const { processamentoId, lancamentos } = await request.json()

  if (!processamentoId || !lancamentos || !Array.isArray(lancamentos)) {
    return NextResponse.json({ error: 'processamentoId e lancamentos (array) são obrigatórios' }, { status: 400 })
  }

  try {
    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({ status: 'salvando' })
      .eq('id', processamentoId)

    const rows = (lancamentos as LancamentoAI[]).map(l => limparLancamento(l, processamentoId))

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('lancamentos')
      .insert(rows)
      .select('id')

    if (insertError) throw new Error(insertError.message)

    const resultado = { inseridos: inserted?.length ?? 0, erros: [] }

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({ status: 'concluido', resultado })
      .eq('id', processamentoId)

    return NextResponse.json(resultado)

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({ status: 'erro', erro: errorMessage })
      .eq('id', processamentoId)

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
