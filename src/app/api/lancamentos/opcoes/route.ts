import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { formatarDataEntrega } from '@/lib/formatar-lancamento'
import { chaveEntrega, parseDataEntrega } from '@/lib/entrega-query'

function uniqueSorted(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v?.trim())))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function sortEntregas(values: string[]): string[] {
  const uniq = [...new Set(values.filter(Boolean))]
  const pronto = uniq.filter(v => /^pronto$/i.test(v))
  const outros = uniq.filter(v => !/^pronto$/i.test(v))

  outros.sort((a, b) => {
    const pa = parseDataEntrega(a)
    const pb = parseDataEntrega(b)
    if (pa && pa !== 'pronto' && pb && pb !== 'pronto') {
      return chaveEntrega(pa.mes, pa.ano) - chaveEntrega(pb.mes, pb.ano)
    }
    return a.localeCompare(b, 'pt-BR')
  })

  return [...(pronto.length > 0 ? ['Pronto'] : []), ...outros]
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('lancamentos')
    .select('construtora, empreendimento, bairro, tipologia, data_entrega')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  const empreendimentosPorConstrutora: Record<string, string[]> = {}
  for (const row of rows) {
    if (!row.construtora || !row.empreendimento) continue
    if (!empreendimentosPorConstrutora[row.construtora]) {
      empreendimentosPorConstrutora[row.construtora] = []
    }
    if (!empreendimentosPorConstrutora[row.construtora].includes(row.empreendimento)) {
      empreendimentosPorConstrutora[row.construtora].push(row.empreendimento)
    }
  }
  for (const key of Object.keys(empreendimentosPorConstrutora)) {
    empreendimentosPorConstrutora[key].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }

  return NextResponse.json({
    construtoras: uniqueSorted(rows.map(r => r.construtora)),
    empreendimentos: uniqueSorted(rows.map(r => r.empreendimento)),
    empreendimentosPorConstrutora,
    bairros: uniqueSorted(rows.map(r => r.bairro)),
    tipologias: uniqueSorted(rows.map(r => r.tipologia)),
    entregas: sortEntregas(
      rows.map(r => formatarDataEntrega(r.data_entrega) ?? r.data_entrega?.trim() ?? null)
    ),
  })
}
