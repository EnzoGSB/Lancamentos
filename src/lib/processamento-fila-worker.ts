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

async function buscarProcessamentos(): Promise<ProcessamentoMin[]> {
  const res = await fetch('/api/processamentos')
  const data = await res.json()
  return Array.isArray(data) ? data : []
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
    const processamentos = await buscarProcessamentos()

    if (haProcessamentoEmAndamento(processamentos)) {
      return { iniciou: false, ocupado: true }
    }

    const proximo = proximoPendente(processamentos)
    if (!proximo) return { iniciou: false }

    const res = await fetch('/api/processar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processamentoId: proximo.id }),
    })

    const data = await res.json().catch(() => ({}))

    if (res.status === 409 && data.busy) {
      return { iniciou: false, ocupado: true }
    }

    if (!res.ok) {
      emitirAtualizacao()
      return { iniciou: true, id: proximo.id, erro: data.error || 'Erro ao processar PDF' }
    }

    emitirAtualizacao()
    return { iniciou: true, id: proximo.id }
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
