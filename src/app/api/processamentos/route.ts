import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

  if (concluidoIds.length > 0) {
    const { data: lancamentos } = await supabaseAdmin
      .from('lancamentos')
      .select('processamento_id, empreendimento')
      .in('processamento_id', concluidoIds)

    if (lancamentos) {
      const porId = new Map<string, Set<string>>()
      for (const l of lancamentos) {
        if (!l.processamento_id) continue
        const emp = l.empreendimento?.trim()
        if (!emp) continue
        if (!porId.has(l.processamento_id)) porId.set(l.processamento_id, new Set())
        porId.get(l.processamento_id)!.add(emp)
      }
      for (const [id, set] of porId) {
        empreendimentosPorProcessamento.set(id, set.size)
      }
    }
  }

  const enriched = data.map(p => ({
    ...p,
    empreendimentos_inseridos: p.status === 'concluido'
      ? (empreendimentosPorProcessamento.get(p.id) ?? 0)
      : null,
  }))

  return NextResponse.json(enriched)
}
