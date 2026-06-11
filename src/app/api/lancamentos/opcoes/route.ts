import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function uniqueSorted(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v?.trim())))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('lancamentos')
    .select('construtora, empreendimento, bairro, tipologia')

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
  })
}
