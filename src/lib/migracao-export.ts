type SqlValue = string | number | boolean | null | Record<string, unknown> | unknown[]

function escapeText(value: string): string {
  return value.replace(/'/g, "''")
}

export function sqlValue(value: SqlValue): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') {
    return `'${escapeText(JSON.stringify(value))}'::jsonb`
  }
  return `'${escapeText(String(value))}'`
}

export function sqlUuid(value: string | null | undefined): string {
  if (!value) return 'NULL'
  return `'${escapeText(value)}'::uuid`
}

export function sqlTimestamptz(value: string | null | undefined): string {
  if (!value) return 'NULL'
  return `'${escapeText(value)}'::timestamptz`
}

export function buildProcessamentoInsert(row: Record<string, SqlValue>): string {
  return `INSERT INTO public.processamentos_lancamentos (id, storage_path, original_filename, status, tipo, analise_ia, lancamentos_ai, resultado, erro, created_at, updated_at, content_hash, page_count, extracao_checkpoint) VALUES (${[
    sqlUuid(row.id as string),
    sqlValue(row.storage_path as string),
    sqlValue(row.original_filename as string | null),
    sqlValue(row.status as string),
    sqlValue(row.tipo as string | null),
    row.analise_ia != null ? sqlValue(row.analise_ia as Record<string, unknown>) : 'NULL',
    row.lancamentos_ai != null ? sqlValue(row.lancamentos_ai as Record<string, unknown>) : 'NULL',
    row.resultado != null ? sqlValue(row.resultado as Record<string, unknown>) : 'NULL',
    sqlValue(row.erro as string | null),
    sqlTimestamptz(row.created_at as string),
    sqlTimestamptz(row.updated_at as string),
    sqlValue(row.content_hash as string | null),
    row.page_count != null ? sqlValue(row.page_count as number) : 'NULL',
    row.extracao_checkpoint != null ? sqlValue(row.extracao_checkpoint as Record<string, unknown>) : 'NULL',
  ].join(', ')}) ON CONFLICT (id) DO NOTHING;`
}

export function buildLancamentoInsert(row: Record<string, SqlValue>): string {
  return `INSERT INTO public.lancamentos (id, construtora, empreendimento, endereco, bairro, data_entrega, metragem, tipologia, unidade, andar, vagas, valor_minimo, valor_maximo, desconto_margem, mais_detalhes, processamento_id, created_at, updated_at) VALUES (${[
    sqlUuid(row.id as string),
    sqlValue(row.construtora as string),
    sqlValue(row.empreendimento as string),
    sqlValue(row.endereco as string | null),
    sqlValue(row.bairro as string | null),
    sqlValue(row.data_entrega as string | null),
    sqlValue(row.metragem as string | null),
    sqlValue(row.tipologia as string | null),
    sqlValue(row.unidade as string | null),
    sqlValue(row.andar as string | null),
    sqlValue(row.vagas as string | null),
    row.valor_minimo != null ? sqlValue(Number(row.valor_minimo)) : 'NULL',
    row.valor_maximo != null ? sqlValue(Number(row.valor_maximo)) : 'NULL',
    sqlValue(row.desconto_margem as string | null),
    row.mais_detalhes != null ? sqlValue(row.mais_detalhes as Record<string, unknown>) : 'NULL',
    sqlUuid(row.processamento_id as string | null),
    sqlTimestamptz(row.created_at as string),
    sqlTimestamptz(row.updated_at as string),
  ].join(', ')}) ON CONFLICT (id) DO NOTHING;`
}

export function buildCacheInsert(row: Record<string, SqlValue>): string {
  return `INSERT INTO public.extracao_pdf_cache (content_hash, pipeline_version, tipo, analise_ia, lancamentos_ai, created_at, updated_at) VALUES (${[
    sqlValue(row.content_hash as string),
    sqlValue(row.pipeline_version as string),
    sqlValue(row.tipo as string),
    sqlValue(row.analise_ia as Record<string, unknown>),
    sqlValue(row.lancamentos_ai as Record<string, unknown>),
    sqlTimestamptz(row.created_at as string),
    sqlTimestamptz(row.updated_at as string),
  ].join(', ')}) ON CONFLICT (content_hash) DO NOTHING;`
}

export async function fetchAllRows<T extends Record<string, unknown>>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 500
): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await fetchPage(from, to)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}
