import type { ImovelResumo } from './assistente-imoveis'

export type AssistenteMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  imoveis?: ImovelResumo[]
}

export type AssistenteConversa = {
  id: string
  titulo: string
  messages: AssistenteMessage[]
  updatedAt: number
}

const STORAGE_KEY = 'tabeloes-assistente-historico'
const MAX_CONVERSAS = 50

export function tituloDaConversa(texto: string): string {
  const limpo = texto.trim()
  if (limpo.length <= 56) return limpo || 'Nova pesquisa'
  return `${limpo.slice(0, 56)}…`
}

export function carregarHistorico(): AssistenteConversa[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AssistenteConversa[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function salvarHistorico(conversas: AssistenteConversa[]): void {
  if (typeof window === 'undefined') return
  const ordenadas = [...conversas]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSAS)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ordenadas))
}
