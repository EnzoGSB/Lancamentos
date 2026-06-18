import { normalizarTextoBusca } from './busca-texto'

/** Parte do bairro antes da vírgula (ex.: "Vila Madalena, São Paulo" → "vila madalena"). */
export function parteBairro(val: string | null | undefined): string {
  if (!val?.trim()) return ''
  return normalizarTextoBusca(val.split(',')[0])
}

function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + custo
      )
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }

  return prev[b.length]
}

/**
 * Casamento de bairro: exato (sem acento) ou no máximo 1 letra faltando/sobrando/typo.
 * Não confunde bairros distintos (ex.: Vila Madalena ≠ Vila Mariana).
 */
export function bairrosCoincidem(pedido: string, cadastro: string | null | undefined): boolean {
  const a = parteBairro(pedido)
  const b = parteBairro(cadastro)
  if (!a || !b) return false
  if (a === b) return true

  const dist = distanciaLevenshtein(a, b)
  const lenDiff = Math.abs(a.length - b.length)
  return dist <= 1 && lenDiff <= 1
}

function melhorCasamentoBairro(pedido: string, catalogo: string[]): string | null {
  const alvo = parteBairro(pedido)
  if (!alvo || alvo.length < 3) return null

  const exatos = catalogo.filter(c => {
    const cn = normalizarTextoBusca(c)
    return cn === normalizarTextoBusca(pedido) || parteBairro(c) === alvo
  })
  if (exatos.length === 1) return exatos[0]
  if (exatos.length > 1) return exatos[0]

  const fuzzy = catalogo.filter(c => bairrosCoincidem(pedido, c))
  if (fuzzy.length === 0) return null
  if (fuzzy.length === 1) return fuzzy[0]

  return fuzzy.sort((x, y) =>
    distanciaLevenshtein(alvo, parteBairro(x)) - distanciaLevenshtein(alvo, parteBairro(y))
  )[0]
}

/** Resolve nomes pedidos para entradas canônicas do catálogo (exato ou typo/accento). */
export function resolverBairrosNoCatalogo(pedidos: string[], catalogo: string[]): string[] {
  const vistos = new Set<string>()
  const resolvidos: string[] = []

  for (const pedido of pedidos) {
    const canon = melhorCasamentoBairro(pedido, catalogo)
    if (canon && !vistos.has(canon)) {
      vistos.add(canon)
      resolvidos.push(canon)
    }
  }

  return resolvidos
}

function extrairCandidatosLocalizacao(message: string): string[] {
  const texto = normalizarTextoBusca(message)
  const candidatos: string[] = []

  const padroes = [
    /\b(?:na\s+)?regiao\s+(?:de|da|do)\s+(.+?)(?=\s+(?:com|ate|a\s+partir|no\s+minimo|pelo\s+menos)\s+|$)/i,
    /\bbairro\s+(?:de|da|do)\s+(.+?)(?=\s+(?:com|ate|a\s+partir)\s+|$)/i,
  ]

  for (const re of padroes) {
    const m = texto.match(re)
    if (m?.[1]) {
      const nome = m[1].trim()
      if (nome.length >= 3) candidatos.push(nome)
    }
  }

  return candidatos
}

function textoContemBairro(texto: string, parteCatalogo: string): boolean {
  if (!parteCatalogo) return false
  if (texto.includes(parteCatalogo)) return true

  const len = parteCatalogo.length
  for (let delta = -1; delta <= 1; delta++) {
    const tamanho = len + delta
    if (tamanho < 3) continue
    for (let i = 0; i <= texto.length - tamanho; i++) {
      const trecho = texto.slice(i, i + tamanho)
      if (distanciaLevenshtein(trecho, parteCatalogo) <= 1
        && Math.abs(trecho.length - parteCatalogo.length) <= 1) {
        return true
      }
    }
  }

  return false
}

/** Detecta bairros mencionados na mensagem casando com o catálogo (prioriza nomes mais longos). */
export function extrairBairrosDaMensagem(message: string, catalogo: string[]): string[] {
  const texto = normalizarTextoBusca(message)
  const encontrados: string[] = []
  const vistos = new Set<string>()

  const add = (entrada: string) => {
    if (!vistos.has(entrada)) {
      vistos.add(entrada)
      encontrados.push(entrada)
    }
  }

  // "na região de/da/do …" ou "bairro de …"
  for (const candidato of extrairCandidatosLocalizacao(message)) {
    const canon = melhorCasamentoBairro(candidato, catalogo)
    if (canon) add(canon)
  }
  if (encontrados.length > 0) return encontrados

  const ordenado = [...catalogo].sort(
    (a, b) => parteBairro(b).length - parteBairro(a).length
  )

  for (const entrada of ordenado) {
    const parte = parteBairro(entrada)
    if (parte.length < 5) continue
    if (!textoContemBairro(texto, parte)) continue
    add(entrada)
  }

  return encontrados
}

const TERMOS_LOCALIZACAO_SOLTO = new Set([
  'vila',
  'jardim',
  'jardins',
  'parque',
  'cidade',
  'bairro',
  'regiao',
  'zona',
  'na',
  'no',
  'em',
  'da',
  'do',
  'de',
])

function termoEhFragmentoLocalComPartes(
  t: string,
  partesBairro: Set<string>,
  bairrosResolvidos: string[]
): boolean {
  const nt = normalizarTextoBusca(t)
  if (!nt) return true
  if (TERMOS_LOCALIZACAO_SOLTO.has(nt)) return true
  if (partesBairro.has(nt)) return true
  if (bairrosResolvidos.some(b => bairrosCoincidem(t, b))) return true
  return false
}

/** Remove termos/q genéricos de localização quando o bairro já está no filtro estruturado. */
export function limparBuscaTextoDeBairro<T extends { q?: string; termos?: string[] }>(
  filtros: T,
  bairrosResolvidos: string[]
): T {
  if (!bairrosResolvidos.length) return filtros

  const next = { ...filtros }
  const partesBairro = new Set<string>()
  for (const b of bairrosResolvidos) {
    for (const p of parteBairro(b).split(/\s+/)) {
      if (p.length >= 3) partesBairro.add(p)
    }
  }

  const termoEhFragmentoLocal = (t: string): boolean =>
    termoEhFragmentoLocalComPartes(t, partesBairro, bairrosResolvidos)

  if (next.termos?.length) {
    const termos = next.termos.map(t => t.trim()).filter(t => t && !termoEhFragmentoLocal(t))
    if (termos.length) next.termos = termos
    else delete next.termos
  }

  if (next.q?.trim()) {
    let q = next.q.trim()
    for (const b of bairrosResolvidos) {
      const parte = parteBairro(b)
      q = q.replace(new RegExp(parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
    }
    q = q
      .replace(/\b(?:na\s+)?regiao\s+(?:de|da|do)\s+/gi, ' ')
      .replace(/\b(?:na|no|em)\s+(?:vila|bairro)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (q) next.q = q
    else delete next.q
  }

  return next
}

export function ajustarFiltrosBairro<T extends { q?: string; termos?: string[]; bairro?: string[] }>(
  message: string,
  filtros: T,
  catalogo: string[]
): T {
  const extraidos = extrairBairrosDaMensagem(message, catalogo)
  const daIA = resolverBairrosNoCatalogo(filtros.bairro ?? [], catalogo)

  let bairros: string[]
  if (extraidos.length > 0) {
    bairros = extraidos
  } else if (daIA.length > 0) {
    bairros = daIA
  } else {
    let next = { ...filtros }
    delete next.bairro

    const candidatosRegiao = extrairCandidatosLocalizacao(message)
    const resolvidosRegiao = resolverBairrosNoCatalogo(candidatosRegiao, catalogo)
    if (resolvidosRegiao.length > 0) {
      next = { ...next, bairro: resolvidosRegiao }
      return limparBuscaTextoDeBairro(next, resolvidosRegiao)
    }

    const texto = normalizarTextoBusca(message)
    const fraseBairro = candidatosRegiao[0]
      ?? texto.match(
        /\b(?:vila|jardim|jardins|parque|chacara)\s+[a-z]{3,}(?:\s+[a-z]{3,})?/
      )?.[0]

    if (fraseBairro) {
      if (next.termos?.length) {
        const termos = next.termos.filter(t =>
          !termoEhFragmentoLocalComPartes(t, new Set(), [])
        )
        if (termos.length) next.termos = termos
        else delete next.termos
      }
      const qAtual = normalizarTextoBusca(next.q ?? '')
      const fraseNorm = normalizarTextoBusca(fraseBairro)
      if (!qAtual || qAtual.includes('regiao') || !qAtual.includes(fraseNorm)) {
        next.q = fraseBairro
      }
    }

    return next
  }

  let next = { ...filtros, bairro: bairros }
  next = limparBuscaTextoDeBairro(next, bairros)
  return next
}
