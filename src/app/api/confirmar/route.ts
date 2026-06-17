import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AnaliseIA, LancamentoAI } from '@/lib/types'
import { normalizarLancamento } from '@/lib/formatar-lancamento'
import { construtoraManualSeAplicavel } from '@/lib/construtora-processamento'

function limparLancamento(raw: LancamentoAI, processamentoId: string) {
  const l = normalizarLancamento(raw)
  return {
    construtora: l.construtora ?? 'Não informada',
    empreendimento: l.empreendimento ?? 'Não informado',
    endereco: l.endereco ?? null,
    bairro: l.bairro ?? null,
    data_entrega: l.data_entrega ?? null,
    metragem: l.metragem ?? null,
    tipologia: l.tipologia ?? null,
    unidade: l.unidade ?? null,
    andar: l.andar ?? null,
    vagas: l.vagas ?? null,
    valor_minimo: l.valor_minimo != null ? Number(l.valor_minimo) || null : null,
    valor_maximo: l.valor_maximo != null ? Number(l.valor_maximo) || null : null,
    desconto_margem: l.desconto_margem ?? null,
    mais_detalhes: l.mais_detalhes ?? null,
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

    const { data: proc } = await supabaseAdmin
      .from('processamentos_lancamentos')
      .select('analise_ia')
      .eq('id', processamentoId)
      .single()

    const analiseAtual = (proc?.analise_ia ?? {}) as AnaliseIA
    const construtoraManual = construtoraManualSeAplicavel(
      analiseAtual.construtora,
      lancamentos as LancamentoAI[]
    )

    const patch: { status: string; resultado: typeof resultado; analise_ia?: AnaliseIA } = {
      status: 'concluido',
      resultado,
    }

    if (construtoraManual) {
      patch.analise_ia = {
        ...analiseAtual,
        construtora: construtoraManual,
      }
    }

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update(patch)
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
