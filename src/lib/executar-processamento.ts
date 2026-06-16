import { supabaseAdmin } from '@/lib/supabase-admin'
import { analisarPDF, processarSingle, processarMulti } from '@/lib/ai-lancamentos'
import { createPDFParser } from '@/lib/pdf-parse-server'
import { STATUS_SLOT_OCUPADO } from '@/lib/fila-processamento'
import {
  ProcessamentoCanceladoError,
  finalizarProcessamentoCancelado,
  verificarProcessamentoAtivo,
} from '@/lib/processamento-cancelado'
import { buscarExtracaoCache, salvarExtracaoCache } from '@/lib/extracao-cache'
import type { AnaliseIA, LancamentoAI } from '@/lib/types'

const ERRO_EXTRACAO_VAZIA =
  'Nenhum lançamento extraído do PDF. Verifique se o documento contém tabela de preços/unidades.'

function patchStatus<T extends Record<string, unknown>>(fields: T) {
  return { ...fields, updated_at: new Date().toISOString() }
}

export type ResultadoProcessamento =
  | { ok: true; analise: AnaliseIA; lancamentos: LancamentoAI[]; fromCache?: boolean }
  | { ok: false; cancelled: true }
  | { ok: false; erro: string; busy?: boolean; notFound?: boolean; invalidStatus?: boolean }

export async function executarProcessamento(processamentoId: string): Promise<ResultadoProcessamento> {
  const { data: proc, error: procError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('*')
    .eq('id', processamentoId)
    .single()

  if (procError || !proc) {
    return { ok: false, erro: 'Processamento não encontrado', notFound: true }
  }

  const { data: outroEmAndamento } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, original_filename')
    .in('status', [...STATUS_SLOT_OCUPADO])
    .neq('id', processamentoId)
    .limit(1)
    .maybeSingle()

  if (outroEmAndamento) {
    return {
      ok: false,
      erro: 'Aguarde o processamento anterior terminar.',
      busy: true,
    }
  }

  if (!['pendente', 'erro'].includes(proc.status)) {
    return {
      ok: false,
      erro: `Processamento não pode ser iniciado no status "${proc.status}".`,
      invalidStatus: true,
    }
  }

  try {
    await verificarProcessamentoAtivo(supabaseAdmin, processamentoId)

    if (proc.content_hash) {
      const cache = await buscarExtracaoCache(supabaseAdmin, proc.content_hash)
      if (cache) {
        if (cache.lancamentos.length === 0) {
          throw new Error(ERRO_EXTRACAO_VAZIA)
        }

        await verificarProcessamentoAtivo(supabaseAdmin, processamentoId)
        await supabaseAdmin
          .from('processamentos_lancamentos')
          .update(patchStatus({
            status: 'aguardando_confirmacao',
            tipo: cache.tipo,
            analise_ia: cache.analise_ia,
            lancamentos_ai: { lancamentos: cache.lancamentos },
            erro: null,
          }))
          .eq('id', processamentoId)

        return {
          ok: true,
          analise: cache.analise_ia,
          lancamentos: cache.lancamentos,
          fromCache: true,
        }
      }
    }

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update(patchStatus({ status: 'extraindo', erro: null }))
      .eq('id', processamentoId)

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('pdfs')
      .download(proc.storage_path)

    if (downloadError || !fileData) {
      throw new Error(`Erro ao baixar PDF: ${downloadError?.message}`)
    }

    const arrayBuffer = await fileData.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const parser = createPDFParser(buffer)
    const textResult = await parser.getText()
    const extractedText: string = textResult.text

    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error('Texto extraído do PDF está vazio ou muito curto. O PDF pode ser escaneado ou protegido.')
    }

    await verificarProcessamentoAtivo(supabaseAdmin, processamentoId)

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update(patchStatus({ status: 'analisando' }))
      .eq('id', processamentoId)

    const analise = await analisarPDF(extractedText, proc.original_filename || '')

    await verificarProcessamentoAtivo(supabaseAdmin, processamentoId)

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update(patchStatus({ status: 'processando', tipo: analise.tipo, analise_ia: analise }))
      .eq('id', processamentoId)

    const lancamentos: LancamentoAI[] = analise.tipo === 'single'
      ? await processarSingle(buffer, analise, extractedText)
      : await processarMulti(buffer, analise, extractedText)

    if (lancamentos.length === 0) {
      throw new Error(ERRO_EXTRACAO_VAZIA)
    }

    await verificarProcessamentoAtivo(supabaseAdmin, processamentoId)

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update(patchStatus({
        status: 'aguardando_confirmacao',
        lancamentos_ai: { lancamentos },
      }))
      .eq('id', processamentoId)

    if (proc.content_hash) {
      await salvarExtracaoCache(supabaseAdmin, proc.content_hash, analise, lancamentos)
    }

    return { ok: true, analise, lancamentos }
  } catch (err) {
    if (err instanceof ProcessamentoCanceladoError) {
      await finalizarProcessamentoCancelado(supabaseAdmin, processamentoId)
      return { ok: false, cancelled: true }
    }

    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update(patchStatus({ status: 'erro', erro: errorMessage }))
      .eq('id', processamentoId)

    return { ok: false, erro: errorMessage }
  }
}
