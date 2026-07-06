import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  buildCacheInsert,
  buildLancamentoInsert,
  buildProcessamentoInsert,
  fetchAllRows,
} from '@/lib/migracao-export'
import { SQL_SCHEMA_DESTINO } from '@/lib/migracao-sql'

export async function GET() {
  try {
    const processamentos = await fetchAllRows(async (from, to) =>
      supabaseAdmin
        .from('processamentos_lancamentos')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, to)
    )

    const lancamentos = await fetchAllRows(async (from, to) =>
      supabaseAdmin
        .from('lancamentos')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, to)
    )

    const cache = await fetchAllRows(async (from, to) =>
      supabaseAdmin
        .from('extracao_pdf_cache')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, to)
    )

    const lines: string[] = [
      '-- Exportação Tabelões — cole no SQL Editor do projeto DESTINO',
      `-- Gerado em ${new Date().toISOString()}`,
      '-- Ordem: schema (se ainda não rodou) → dados → validação',
      '',
      '-- ========== SCHEMA (pule se já executou o passo 1) ==========',
      SQL_SCHEMA_DESTINO.trim(),
      '',
      '-- ========== DADOS: processamentos_lancamentos ==========',
      ...processamentos.map(row => buildProcessamentoInsert(row)),
      '',
      '-- ========== DADOS: lancamentos ==========',
      ...lancamentos.map(row => buildLancamentoInsert(row)),
      '',
      '-- ========== DADOS: extracao_pdf_cache (opcional) ==========',
      ...cache.map(row => buildCacheInsert(row)),
      '',
      '-- ========== VALIDAÇÃO ==========',
      `SELECT 'processamentos_lancamentos' AS tabela, count(*) FROM public.processamentos_lancamentos`,
      `UNION ALL SELECT 'lancamentos', count(*) FROM public.lancamentos`,
      `UNION ALL SELECT 'extracao_pdf_cache', count(*) FROM public.extracao_pdf_cache;`,
      '',
    ]

    const body = lines.join('\n')
    const filename = `tabeloes-migracao-${new Date().toISOString().slice(0, 10)}.sql`

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar SQL'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
