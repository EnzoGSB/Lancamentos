import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { interpretarBusca, lancamentoParaResumo, type ChatTurn } from '@/lib/assistente-imoveis'
import { buscarLancamentos, carregarOpcoesCatalogo } from '@/lib/lancamentos-query'

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
    const { lancamentos } = await buscarLancamentos(supabaseAdmin, filtros, { limit: 24 })

    const imoveis = lancamentos.map(lancamentoParaResumo)

    let respostaFinal = resposta
    if (imoveis.length === 0) {
      respostaFinal = `${resposta} Não encontrei imóveis com esses critérios no catálogo. Tente ampliar a busca (outro bairro, faixa de preço maior ou menos filtros).`
    } else if (imoveis.length === 1) {
      respostaFinal = `${resposta} Encontrei 1 imóvel.`
    } else {
      respostaFinal = `${resposta} Encontrei ${imoveis.length} imóveis.`
    }

    return NextResponse.json({
      resposta: respostaFinal,
      imoveis,
      total: imoveis.length,
      filtros_aplicados: filtros,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
