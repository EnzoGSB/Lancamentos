import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&')
}

function parseMulti(searchParams: URLSearchParams, key: string) {
  return searchParams.getAll(key).map(v => v.trim()).filter(Boolean)
}

function applyMultiFilter<T extends { eq: (col: string, val: string) => T; in: (col: string, vals: string[]) => T }>(
  query: T,
  column: string,
  values: string[]
): T {
  if (values.length === 1) return query.eq(column, values[0])
  if (values.length > 1) return query.in(column, values)
  return query
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const construtoras = parseMulti(searchParams, 'construtora')
  const empreendimentos = parseMulti(searchParams, 'empreendimento')
  const bairros = parseMulti(searchParams, 'bairro')
  const tipologias = parseMulti(searchParams, 'tipologia')
  const entregas = parseMulti(searchParams, 'entrega')
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

  query = applyMultiFilter(query, 'construtora', construtoras)
  query = applyMultiFilter(query, 'empreendimento', empreendimentos)
  query = applyMultiFilter(query, 'bairro', bairros)
  query = applyMultiFilter(query, 'tipologia', tipologias)

  if (entregas.length > 0) {
    query = query.or(
      entregas.map(e => `data_entrega.ilike.${escapeIlike(e)}`).join(',')
    )
  }

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
