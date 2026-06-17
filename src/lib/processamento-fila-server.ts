import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { STATUS_PROCESSAMENTO_OCUPADO } from '@/lib/fila-processamento'
import { executarProcessamento } from '@/lib/executar-processamento'

/** Tempo sem atualização para considerar processamento abandonado (timeout Vercel, crash, etc.). */
const FANTASMA_MS = 20 * 60 * 1000

function timestampReferencia(updatedAt: string | null | undefined, createdAt: string | null | undefined): number {
  const raw = updatedAt ?? createdAt
  if (!raw) return 0
  return new Date(raw).getTime()
}

export async function limparCanceladosOrfaos(): Promise<void> {
  await supabaseAdmin
    .from('processamentos_lancamentos')
    .delete()
    .eq('status', 'cancelado')
}

export async function recuperarProcessamentosFantasma(): Promise<number> {
  const { data: emProgresso, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, updated_at, created_at')
    .in('status', [...STATUS_PROCESSAMENTO_OCUPADO])

  if (error || !emProgresso?.length) return 0

  const limite = Date.now() - FANTASMA_MS
  const ids = emProgresso
    .filter(p => timestampReferencia(p.updated_at, p.created_at) < limite)
    .map(p => p.id)

  if (ids.length === 0) return 0

  await supabaseAdmin
    .from('processamentos_lancamentos')
    .update({
      status: 'pendente',
      erro: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)

  return ids.length
}

export async function prepararFila(): Promise<void> {
  await limparCanceladosOrfaos()
  await recuperarProcessamentosFantasma()
}

export async function haProcessamentoAtivoNoBanco(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id')
    .in('status', [...STATUS_PROCESSAMENTO_OCUPADO])
    .limit(1)
    .maybeSingle()

  return data != null
}

export async function obterProximoPendenteId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id')
    .eq('status', 'pendente')
    .order('page_count', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

export async function temPendenteNoBanco(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id')
    .eq('status', 'pendente')
    .limit(1)
    .maybeSingle()

  return data != null
}

/** Processa um PDF da fila no servidor; em erro ou sucesso, encadeia o próximo se houver. */
export async function avancarFilaServidor(): Promise<void> {
  await prepararFila()

  if (await haProcessamentoAtivoNoBanco()) return

  const proximoId = await obterProximoPendenteId()
  if (!proximoId) return

  const result = await executarProcessamento(proximoId)

  if (!result.ok && 'busy' in result && result.busy) return

  const deveContinuar =
    result.ok
    || ('cancelled' in result)
    || ('erro' in result && !!result.erro && !result.notFound && !result.invalidStatus)

  if (!deveContinuar) return

  if (await temPendenteNoBanco()) {
    if (!(await haProcessamentoAtivoNoBanco())) {
      agendarAvancoFilaServidor()
    }
  }
}

/** Dispara processamento da fila após a resposta HTTP (upload, cron, etc.). */
export function agendarAvancoFilaServidor(): void {
  after(() => avancarFilaServidor())
}
