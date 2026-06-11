import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&')
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const construtora = searchParams.get('construtora')?.trim()
  const empreendimento = searchParams.get('empreendimento')?.trim()
  const bairro = searchParams.get('bairro')?.trim()
  const tipologia = searchParams.get('tipologia')?.trim()
  const valorMin = searchParams.get('valor_min')
  const valorMax = searchParams.get('valor_max')
  const limit = Math.min(Number(searchParams.get('limit') ?? 500), 1000)
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)

  let query = supabaseAdmin
    .from('lancamentos')
    .select('*', { count: 'exact' })
    .order('construtora')
    .order('empreendimento')
    .order('tipologia')
    .range(offset, offset + limit - 1)

  if (q) {
    const term = escapeIlike(q)
    query = query.or(
      [
        `construtora.ilike.%${term}%`,
        `empreendimento.ilike.%${term}%`,
        `bairro.ilike.%${term}%`,
        `tipologia.ilike.%${term}%`,
        `unidade.ilike.%${term}%`,
        `andar.ilike.%${term}%`,
        `metragem.ilike.%${term}%`,
        `endereco.ilike.%${term}%`,
      ].join(',')
    )
  }

  if (construtora) query = query.eq('construtora', construtora)
  if (empreendimento) query = query.eq('empreendimento', empreendimento)
  if (bairro) query = query.eq('bairro', bairro)
  if (tipologia) query = query.eq('tipologia', tipologia)

  const min = valorMin != null && valorMin !== '' ? Number(valorMin) : null
  const max = valorMax != null && valorMax !== '' ? Number(valorMax) : null
  if (min != null && Number.isFinite(min)) query = query.gte('valor_minimo', min)
  if (max != null && Number.isFinite(max)) query = query.lte('valor_minimo', max)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    lancamentos: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  })
}
