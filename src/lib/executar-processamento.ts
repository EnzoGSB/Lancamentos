import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  analisarPDF,
  processarMultiEmEtapas,
  processarSingleEmEtapas,
} from '@/lib/ai-lancamentos'
import { createPDFParser } from '@/lib/pdf-parse-server'
import { contarPaginasPdf } from '@/lib/pdf-page-count'
import { STATUS_SLOT_OCUPADO } from '@/lib/fila-processamento'
import {
  ProcessamentoCanceladoError,
  finalizarProcessamentoCancelado,
  verificarProcessamentoAtivo,
} from '@/lib/processamento-cancelado'
import { ProcessamentoAdiadoError } from '@/lib/processamento-adiado'
import { buscarExtracaoCache, salvarExtracaoCache } from '@/lib/extracao-cache'
import { iniciarHeartbeatProcessamento } from '@/lib/processamento-heartbeat'
import {
  lerProgressoExtracao,
  progressoIncompleto,
  serializarLancamentosAiComProgresso,
} from '@/lib/processamento-progresso'
import type { AnaliseIA, LancamentoAI } from '@/lib/types'

const ERRO_EXTRACAO_VAZIA =
  'Nenhum lançamento extraído do PDF. Verifique se o documento contém tabela de preços/unidades.'

/** Margem de segurança antes do maxDuration (5 min) da rota /api/processar. */
const ORCAMENTO_ETAPA_MS = 4 * 60 * 1000

function patchStatus<T extends Record<string, unknown>>(fields: T) {
  return { ...fields, updated_at: new Date().toISOString() }
}

export type ResultadoProcessamento =
  | { ok: true; analise: AnaliseIA; lancamentos: LancamentoAI[]; fromCache?: boolean }
  | { ok: false; cancelled: true }
  | { ok: false; adiado: true }
  | { ok: false; continua: true }
  | { ok: false; erro: string; busy?: boolean; notFound?: boolean; invalidStatus?: boolean }

async function salvarProgressoParcial(
  processamentoId: string,
  progresso: NonNullable<ReturnType<typeof lerProgressoExtracao>>
) {
  const { data } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .update(patchStatus({
      status: 'processando',
      lancamentos_ai: serializarLancamentosAiComProgresso(progresso),
    }))
    .eq('id', processamentoId)
    .in('status', [...STATUS_SLOT_OCUPADO])
    .select('id')
    .maybeSingle()

  if (!data) {
    throw new ProcessamentoAdiadoError()
  }
}

async function extrairComEtapas(
  processamentoId: string,
  buffer: Buffer,
  analise: AnaliseIA,
  extractedText: string,
  progressoSalvo: ReturnType<typeof lerProgressoExtracao>
): Promise<{ concluido: true; lancamentos: LancamentoAI[] } | { concluido: false }> {
  const inicioEtapa = Date.now()

  const opts = {
    progresso: progressoSalvo,
    onFaixaConcluida: async (progresso: NonNullable<ReturnType<typeof lerProgressoExtracao>>) => {
      await verificarProcessamentoAtivo(supabaseAdmin, processamentoId, { duranteExtracao: true })
      await salvarProgressoParcial(processamentoId, progresso)
    },
    deveEncerrarEtapa: () => Date.now() - inicioEtapa >= ORCAMENTO_ETAPA_MS,
  }

  const resultado = analise.tipo === 'single'
    ? await processarSingleEmEtapas(buffer, analise, extractedText, opts)
    : await processarMultiEmEtapas(buffer, analise, extractedText, opts)

  if (resultado.concluido && resultado.lancamentos) {
    return { concluido: true, lancamentos: resultado.lancamentos }
  }

  if (resultado.progresso && progressoIncompleto(resultado.progresso)) {
    await salvarProgressoParcial(processamentoId, resultado.progresso)
    return { concluido: false }
  }

  throw new Error('Extração interrompida sem progresso salvo.')
}

export async function executarProcessamento(processamentoId: string): Promise<ResultadoProcessamento> {
  const { data: proc, error: procError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('*')
    .eq('id', processamentoId)
    .single()

  if (procError || !proc) {
    return { ok: false, erro: 'Processamento não encontrado', notFound: true }
  }

  const progressoSalvo = lerProgressoExtracao(proc.lancamentos_ai)
  const continuando = proc.status === 'processando' && progressoSalvo != null && progressoIncompleto(progressoSalvo)

  if (!continuando) {
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
  }

  if (!['pendente', 'erro', 'adiado'].includes(proc.status) && !continuando) {
    return {
      ok: false,
      erro: `Processamento não pode ser iniciado no status "${proc.status}".`,
      invalidStatus: true,
    }
  }

  const pararHeartbeat = iniciarHeartbeatProcessamento(supabaseAdmin, processamentoId)

  try {
    await verificarProcessamentoAtivo(supabaseAdmin, processamentoId)

    if (!continuando && proc.content_hash) {
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

    let analise: AnaliseIA
    let extractedText: string
    let buffer: Buffer

    if (continuando) {
      analise = proc.analise_ia as AnaliseIA
      if (!analise?.tipo) {
        throw new Error('Retomada impossível: análise do PDF ausente. Use "Tentar novamente" do zero.')
      }

      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('pdfs')
        .download(proc.storage_path)

      if (downloadError || !fileData) {
        throw new Error(`Erro ao baixar PDF: ${downloadError?.message}`)
      }

      buffer = Buffer.from(await fileData.arrayBuffer())
      const parser = createPDFParser(buffer)
      const textResult = await parser.getText()
      extractedText = textResult.text
    } else {
      const progressoRetomada = lerProgressoExtracao(proc.lancamentos_ai)
      const analiseSalva = proc.analise_ia as AnaliseIA | null
      const podeRetomar =
        progressoRetomada != null
        && progressoIncompleto(progressoRetomada)
        && analiseSalva?.tipo

      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('pdfs')
        .download(proc.storage_path)

      if (downloadError || !fileData) {
        throw new Error(`Erro ao baixar PDF: ${downloadError?.message}`)
      }

      buffer = Buffer.from(await fileData.arrayBuffer())

      const parser = createPDFParser(buffer)
      const textResult = await parser.getText()
      extractedText = textResult.text

      if (podeRetomar) {
        analise = analiseSalva!
        const { data: retomadaAtiva } = await supabaseAdmin
          .from('processamentos_lancamentos')
          .update(patchStatus({ status: 'processando', erro: null }))
          .eq('id', processamentoId)
          .in('status', ['pendente', 'erro', 'adiado'])
          .select('id')
          .maybeSingle()

        if (!retomadaAtiva) {
          throw new ProcessamentoAdiadoError()
        }
      } else {
        await supabaseAdmin
          .from('processamentos_lancamentos')
          .update(patchStatus({ status: 'extraindo', erro: null, lancamentos_ai: null }))
          .eq('id', processamentoId)

        if (proc.page_count == null) {
          const pageCount = await contarPaginasPdf(buffer)
          await supabaseAdmin
            .from('processamentos_lancamentos')
            .update(patchStatus({ page_count: pageCount }))
            .eq('id', processamentoId)
        }

        await verificarProcessamentoAtivo(supabaseAdmin, processamentoId, { duranteExtracao: true })

        await supabaseAdmin
          .from('processamentos_lancamentos')
          .update(patchStatus({ status: 'analisando' }))
          .eq('id', processamentoId)
          .in('status', [...STATUS_SLOT_OCUPADO])

        analise = await analisarPDF(extractedText, proc.original_filename || '', buffer)

        await verificarProcessamentoAtivo(supabaseAdmin, processamentoId, { duranteExtracao: true })

        const { data: aindaAtivo } = await supabaseAdmin
          .from('processamentos_lancamentos')
          .update(patchStatus({ status: 'processando', tipo: analise.tipo, analise_ia: analise }))
          .eq('id', processamentoId)
          .in('status', [...STATUS_SLOT_OCUPADO])
          .select('id')
          .maybeSingle()

        if (!aindaAtivo) {
          throw new ProcessamentoAdiadoError()
        }
      }
    }

    const progressoParaExtracao = continuando
      ? progressoSalvo
      : lerProgressoExtracao(
        (await supabaseAdmin
          .from('processamentos_lancamentos')
          .select('lancamentos_ai')
          .eq('id', processamentoId)
          .single()).data?.lancamentos_ai
      ) ?? progressoSalvo

    const extracao = await extrairComEtapas(
      processamentoId,
      buffer,
      analise,
      extractedText,
      progressoParaExtracao
    )

    if (!extracao.concluido) {
      return { ok: false, continua: true }
    }

    const lancamentos = extracao.lancamentos

    if (lancamentos.length === 0) {
      throw new Error(ERRO_EXTRACAO_VAZIA)
    }

    await verificarProcessamentoAtivo(supabaseAdmin, processamentoId, { duranteExtracao: true })

    const { data: concluidoAtivo } = await supabaseAdmin
      .from('processamentos_lancamentos')
      .update(patchStatus({
        status: 'aguardando_confirmacao',
        lancamentos_ai: { lancamentos },
      }))
      .eq('id', processamentoId)
      .in('status', [...STATUS_SLOT_OCUPADO])
      .select('id')
      .maybeSingle()

    if (!concluidoAtivo) {
      throw new ProcessamentoAdiadoError()
    }

    if (proc.content_hash) {
      await salvarExtracaoCache(supabaseAdmin, proc.content_hash, analise, lancamentos)
    }

    return { ok: true, analise, lancamentos }
  } catch (err) {
    if (err instanceof ProcessamentoCanceladoError) {
      await finalizarProcessamentoCancelado(supabaseAdmin, processamentoId)
      return { ok: false, cancelled: true }
    }

    if (err instanceof ProcessamentoAdiadoError) {
      return { ok: false, adiado: true }
    }

    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'

    const { data: rowAtual } = await supabaseAdmin
      .from('processamentos_lancamentos')
      .select('lancamentos_ai')
      .eq('id', processamentoId)
      .single()

    const progressoAtual = lerProgressoExtracao(rowAtual?.lancamentos_ai)

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update(patchStatus({
        status: 'erro',
        erro: errorMessage,
        ...(progressoAtual && progressoIncompleto(progressoAtual)
          ? { lancamentos_ai: serializarLancamentosAiComProgresso(progressoAtual) }
          : {}),
      }))
      .eq('id', processamentoId)

    return { ok: false, erro: errorMessage }
  } finally {
    pararHeartbeat()
  }
}

export async function obterIdProcessamentoParaContinuar(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, lancamentos_ai')
    .eq('status', 'processando')
    .order('updated_at', { ascending: true })
    .limit(5)

  if (error || !data?.length) return null

  for (const row of data) {
    const p = lerProgressoExtracao(row.lancamentos_ai)
    if (p && progressoIncompleto(p)) return row.id
  }

  return null
}
