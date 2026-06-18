import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { matchesFiltroMetragemFaixa, matchesFiltroValor, matchesFiltroVagas } from '@/lib/lancamentos-query'
import { matchesFiltrosTipologiaDormitorio } from '@/lib/tipologia-filtro'
import type { Lancamento } from '@/lib/types'

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
  const tipos = parseMulti(searchParams, 'tipo')
  const dormitorios = parseMulti(searchParams, 'dormitorio')
  const entregas = parseMulti(searchParams, 'entrega')
  const valorMin = searchParams.get('valor_min')
  const valorMax = searchParams.get('valor_max')
  const metragemMin = searchParams.get('metragem_min')
  const metragemMax = searchParams.get('metragem_max')
  const vagasMin = searchParams.get('vagas_min')
  const limit = Math.min(Number(searchParams.get('limit') ?? 500), 1000)
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)

  const metMin = metragemMin != null && metragemMin !== '' ? Number(metragemMin) : null
  const metMax = metragemMax != null && metragemMax !== '' ? Number(metragemMax) : null
  const vagasMinNum = vagasMin != null && vagasMin !== '' ? Number(vagasMin) : null
  const valMin = valorMin != null && valorMin !== '' ? Number(valorMin) : null
  const valMax = valorMax != null && valorMax !== '' ? Number(valorMax) : null

  const posFiltroTipologia = tipos.length > 0 || dormitorios.length > 0
  const posFiltroMemoria = posFiltroTipologia
    || (metMin != null && Number.isFinite(metMin))
    || (metMax != null && Number.isFinite(metMax))
    || (vagasMinNum != null && Number.isFinite(vagasMinNum) && vagasMinNum > 0)
    || (valMin != null && Number.isFinite(valMin))
    || (valMax != null && Number.isFinite(valMax))

  let query = supabaseAdmin
    .from('lancamentos')
    .select('*', { count: posFiltroMemoria ? undefined : 'exact' })
    .order('construtora')
    .order('empreendimento')
    .order('tipologia')

  if (posFiltroMemoria) {
    query = query.range(0, 9999)
  } else {
    query = query.range(offset, offset + limit - 1)
  }

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

  const min = valMin != null && Number.isFinite(valMin) ? valMin : null
  const max = valMax != null && Number.isFinite(valMax) ? valMax : null

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let lancamentos = (data ?? []) as Lancamento[]

  if (posFiltroMemoria) {
    lancamentos = lancamentos.filter(l => {
      if (!matchesFiltrosTipologiaDormitorio(l.tipologia, tipos, dormitorios)) return false
      if (!matchesFiltroMetragemFaixa(l, metMin, metMax)) return false
      if (!matchesFiltroValor(l, min, max)) return false
      if (!matchesFiltroVagas(l, vagasMinNum)) return false
      return true
    })
    const total = lancamentos.length
    lancamentos = lancamentos.slice(offset, offset + limit)
    return NextResponse.json({ lancamentos, total, limit, offset })
  }

  return NextResponse.json({
    lancamentos,
    total: count ?? 0,
    limit,
    offset,
  })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const ids = (body.ids as string[] | undefined)?.filter(Boolean) ?? []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Informe ao menos um id para apagar.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('lancamentos')
    .delete()
    .in('id', ids)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    removidos: data?.length ?? 0,
    ids: data?.map(r => r.id) ?? [],
  })
}
