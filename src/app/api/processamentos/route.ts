import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  analiseSemConstrutora,
  construtoraManualSeAplicavel,
} from '@/lib/construtora-processamento'
import type { AnaliseIA, LancamentoAI } from '@/lib/types'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json(data)

  const concluidoIds = data.filter(p => p.status === 'concluido').map(p => p.id)
  const empreendimentosPorProcessamento = new Map<string, number>()
  const construtoraPorProcessamento = new Map<string, string>()

  if (concluidoIds.length > 0) {
    const { data: lancamentos } = await supabaseAdmin
      .from('lancamentos')
      .select('processamento_id, empreendimento, construtora')
      .in('processamento_id', concluidoIds)

    if (lancamentos) {
      const porId = new Map<string, Set<string>>()
      const lancamentosPorId = new Map<string, { construtora?: string | null }[]>()

      for (const l of lancamentos) {
        if (!l.processamento_id) continue

        const emp = l.empreendimento?.trim()
        if (emp) {
          if (!porId.has(l.processamento_id)) porId.set(l.processamento_id, new Set())
          porId.get(l.processamento_id)!.add(emp)
        }

        if (!lancamentosPorId.has(l.processamento_id)) {
          lancamentosPorId.set(l.processamento_id, [])
        }
        lancamentosPorId.get(l.processamento_id)!.push(l)
      }

      for (const [id, set] of porId) {
        empreendimentosPorProcessamento.set(id, set.size)
      }

      for (const [id, rows] of lancamentosPorId) {
        const proc = data.find(p => p.id === id)
        const analise = proc?.analise_ia as AnaliseIA | null
        const manual = construtoraManualSeAplicavel(analise?.construtora, rows)
        if (manual) construtoraPorProcessamento.set(id, manual)
      }
    }
  }

  const enriched = data.map(p => {
    const analise = p.analise_ia as AnaliseIA | null
    let construtoraEfetiva: string | null = null

    if (p.status === 'concluido' && analiseSemConstrutora(analise?.construtora)) {
      construtoraEfetiva = construtoraPorProcessamento.get(p.id) ?? null
    }

    if (p.status === 'aguardando_confirmacao' && analiseSemConstrutora(analise?.construtora)) {
      const lancs = (p.lancamentos_ai as { lancamentos?: LancamentoAI[] } | null)?.lancamentos ?? []
      construtoraEfetiva = construtoraManualSeAplicavel(analise?.construtora, lancs)
    }

    return {
      ...p,
      empreendimentos_inseridos: p.status === 'concluido'
        ? (empreendimentosPorProcessamento.get(p.id) ?? 0)
        : null,
      construtora_efetiva: construtoraEfetiva,
    }
  })

  return NextResponse.json(enriched)
}
