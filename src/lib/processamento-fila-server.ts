import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { STATUS_PROCESSAMENTO_OCUPADO } from '@/lib/fila-processamento'
import {
  executarProcessamento,
  obterIdProcessamentoParaContinuar,
} from '@/lib/executar-processamento'
import {
  lerProgressoExtracao,
  progressoIncompleto,
  serializarLancamentosAiComProgresso,
} from '@/lib/processamento-progresso'

/** Sem heartbeat por este tempo → processamento abandonado (não reenfileira sozinho). */
const FANTASMA_MS = 3 * 60 * 60 * 1000

const MSG_FANTASMA =
  'Processamento interrompido (servidor ou timeout). Clique em "Tentar novamente" para continuar de onde parou.'

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
    .select('id, updated_at, created_at, lancamentos_ai')
    .in('status', [...STATUS_PROCESSAMENTO_OCUPADO])

  if (error || !emProgresso?.length) return 0

  const limite = Date.now() - FANTASMA_MS
  const stale = emProgresso.filter(p => timestampReferencia(p.updated_at, p.created_at) < limite)

  if (stale.length === 0) return 0

  for (const row of stale) {
    const progresso = lerProgressoExtracao(row.lancamentos_ai)
    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({
        status: 'erro',
        erro: MSG_FANTASMA,
        updated_at: new Date().toISOString(),
        ...(progresso && progressoIncompleto(progresso)
          ? { lancamentos_ai: serializarLancamentosAiComProgresso(progresso) }
          : {}),
      })
      .eq('id', row.id)
  }

  return stale.length
}

export async function prepararFila(): Promise<void> {
  await limparCanceladosOrfaos()
  await recuperarProcessamentosFantasma()
}

export async function haProcessamentoAtivoSemRetomada(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, lancamentos_ai')
    .in('status', [...STATUS_PROCESSAMENTO_OCUPADO])
    .limit(5)

  if (!data?.length) return false

  return data.some(row => {
    const p = lerProgressoExtracao(row.lancamentos_ai)
    return !p || !progressoIncompleto(p)
  })
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

/** Processa um PDF da fila no servidor; encadeia etapas ou o próximo da fila. */
export async function avancarFilaServidor(): Promise<void> {
  await prepararFila()

  const continuarId = await obterIdProcessamentoParaContinuar()
  if (continuarId) {
    const result = await executarProcessamento(continuarId)
    if ('continua' in result && result.continua) {
      agendarAvancoFilaServidor()
      return
    }
    if (await temPendenteNoBanco()) {
      agendarAvancoFilaServidor()
    } else if (await obterIdProcessamentoParaContinuar()) {
      agendarAvancoFilaServidor()
    }
    return
  }

  if (await haProcessamentoAtivoSemRetomada()) return

  const proximoId = await obterProximoPendenteId()
  if (!proximoId) return

  const result = await executarProcessamento(proximoId)

  if (!result.ok && 'busy' in result && result.busy) return

  if ('continua' in result && result.continua) {
    agendarAvancoFilaServidor()
    return
  }

  if (await temPendenteNoBanco()) {
    agendarAvancoFilaServidor()
  } else if (await obterIdProcessamentoParaContinuar()) {
    agendarAvancoFilaServidor()
  }
}

/** Dispara processamento da fila após a resposta HTTP (upload, cron, etc.). */
export function agendarAvancoFilaServidor(): void {
  after(() => avancarFilaServidor())
}
