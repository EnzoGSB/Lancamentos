import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { interpretarBusca, lancamentoParaResumo, type ChatTurn } from '@/lib/assistente-imoveis'
import { buscarLancamentos, carregarOpcoesCatalogo } from '@/lib/lancamentos-query'

function montarRespostaFinal(
  resposta: string,
  total: number,
  usouTolerancia: boolean
): string {
  if (total === 0) {
    return `${resposta} Não encontrei imóveis com esses critérios no catálogo. Tente ampliar a busca (outro bairro, faixa de preço maior ou menos filtros).`
  }

  let suffix = total === 1 ? ' Encontrei 1 imóvel.' : ` Encontrei ${total} imóveis.`

  if (usouTolerancia) {
    suffix += ' Alguns resultados estão dentro de uma margem de até 5% da metragem solicitada.'
  }

  return `${resposta}${suffix}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const history = Array.isArray(body.history) ? body.history as ChatTurn[] : []

    if (!message) {
      return NextResponse.json({ error: 'message é obrigatório' }, { status: 400 })
    }

    const opcoes = await carregarOpcoesCatalogo(supabaseAdmin)
    const { resposta, filtros } = await interpretarBusca(message, history, opcoes)
    const resultado = await buscarLancamentos(supabaseAdmin, filtros, { limit: 24 })

    const imoveis = resultado.lancamentos.map(lancamentoParaResumo)

    return NextResponse.json({
      resposta: montarRespostaFinal(
        resposta,
        imoveis.length,
        resultado.usou_tolerancia_metragem
      ),
      imoveis,
      total: imoveis.length,
      filtros_aplicados: filtros,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
