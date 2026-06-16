import {
  haProcessamentoEmAndamento,
  proximoPendente,
  type ProcessamentoMin,
} from './fila-processamento'

export const EVENTO_FILA_ATUALIZADA = 'tabeloes-fila-atualizada'

let workerLocked = false

function emitirAtualizacao() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENTO_FILA_ATUALIZADA))
}

type FilaStatus = {
  ocupado: boolean
  proximoId: string | null
  emAndamento?: { id: string; original_filename?: string | null } | null
  error?: string
}

async function buscarStatusFila(): Promise<FilaStatus> {
  const res = await fetch('/api/processamentos/fila')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ocupado: false, proximoId: null, error: data.error || 'Erro ao consultar fila' }
  }
  return data as FilaStatus
}

/** Fallback local quando a API de fila não estiver disponível. */
async function buscarProcessamentos(): Promise<ProcessamentoMin[]> {
  const res = await fetch('/api/processamentos')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function resolverProximoId(): Promise<{ proximoId: string | null; ocupado: boolean; erro?: string }> {
  const fila = await buscarStatusFila()
  if (!fila.error) {
    return { proximoId: fila.proximoId, ocupado: fila.ocupado }
  }

  const processamentos = await buscarProcessamentos()
  if (haProcessamentoEmAndamento(processamentos)) {
    return { proximoId: null, ocupado: true }
  }
  return { proximoId: proximoPendente(processamentos)?.id ?? null, ocupado: false, erro: fila.error }
}

export async function tentarProcessarProximo(): Promise<{
  iniciou: boolean
  id?: string
  ocupado?: boolean
  erro?: string
}> {
  if (workerLocked) return { iniciou: false }

  workerLocked = true
  try {
    while (true) {
      const { proximoId, ocupado, erro } = await resolverProximoId()
      if (erro && !proximoId && !ocupado) return { iniciou: false, erro }

      if (ocupado) {
        return { iniciou: false, ocupado: true }
      }

      if (!proximoId) return { iniciou: false }

      const res = await fetch('/api/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processamentoId: proximoId }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.status === 409 && data.busy) {
        return { iniciou: false, ocupado: true }
      }

      if (data.cancelled) {
        emitirAtualizacao()
        continue
      }

      if (!res.ok) {
        emitirAtualizacao()
        return { iniciou: true, id: proximoId, erro: data.error || 'Erro ao processar PDF' }
      }

      emitirAtualizacao()
      return { iniciou: true, id: proximoId }
    }
  } catch {
    emitirAtualizacao()
    return { iniciou: false, erro: 'Erro de conexão ao processar PDF' }
  } finally {
    workerLocked = false
  }
}

/** Coloca na fila global (status pendente) e tenta iniciar quando houver slot. */
export async function solicitarProcessamento(processamentoId: string): Promise<{
  ok: boolean
  error?: string
  naFila?: boolean
}> {
  const res = await fetch(`/api/processamentos/${processamentoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pendente', erro: null }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: data.error || 'Erro ao enfileirar' }
  }

  emitirAtualizacao()
  const result = await tentarProcessarProximo()
  if (result.erro && result.iniciou) {
    return { ok: false, error: result.erro }
  }
  return { ok: true, naFila: !result.iniciou }
}
