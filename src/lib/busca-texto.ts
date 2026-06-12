/** Normalização e casamento de texto para busca (assistente + catálogo). */

const CORRECOES_ORTografia: Record<string, string> = {
  coorporativa: 'corporativa',
  coorporativo: 'corporativo',
  corpotativa: 'corporativa',
}

export function normalizarTextoBusca(val: string): string {
  let s = val.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  for (const [errado, certo] of Object.entries(CORRECOES_ORTografia)) {
    s = s.replace(new RegExp(errado, 'g'), certo)
  }
  return s.replace(/\s+/g, ' ').trim()
}

export function textoContemConsulta(texto: string, consulta: string): boolean {
  const t = normalizarTextoBusca(texto)
  const c = normalizarTextoBusca(consulta)
  if (!c) return true
  return t.includes(c)
}

export function isBuscaTipologiaComercial(filtros: {
  q?: string
  termos?: string[]
}): boolean {
  const raw = [...(filtros.termos ?? []), filtros.q ?? ''].join(' ')
  const n = normalizarTextoBusca(raw)
  if (/\blaje\b/.test(n)) return true
  if (/\bsala\s+comercial\b/.test(n)) return true
  if (/\bcorporativ/.test(n) && /\b(laje|sala|comercial)\b/.test(n)) return true
  if (/\blaje\s+comercial\b/.test(n)) return true
  return false
}

export function imovelPareceComercial(textoImovel: string): boolean {
  const n = normalizarTextoBusca(textoImovel)
  if (/\blaje\b/.test(n)) return true
  if (/\bsala\b/.test(n) && /\b(comercial|corporativ)/.test(n)) return true
  if (/\bconjunto\s+comercial\b/.test(n)) return true
  if (/\b(corporativ|comercial)\b/.test(n) && !/\bresidencial\b/.test(n)) {
    return /\b(laje|sala|loja|conjunto|andares?\s+comerci)/.test(n)
      || /\bcomercial\b/.test(n)
  }
  return false
}

export function matchesConsultaTexto(
  textoImovel: string,
  opts: { q?: string; termos?: string[] }
): boolean {
  const texto = normalizarTextoBusca(textoImovel)
  const { q, termos } = opts

  if (q?.trim() && textoContemConsulta(texto, q)) return true

  if (!termos?.length) {
    return !q?.trim() || textoContemConsulta(texto, q)
  }

  const frase = termos.join(' ')
  if (textoContemConsulta(texto, frase)) return true

  if (isBuscaTipologiaComercial({ q, termos })) {
    return imovelPareceComercial(texto)
  }

  return termos.every(t => textoContemConsulta(texto, t))
}

export function corrigirTermosBusca(termos: string[]): string[] {
  return termos.map(t => {
    let s = t
    for (const [errado, certo] of Object.entries(CORRECOES_ORTografia)) {
      s = s.replace(new RegExp(errado, 'gi'), certo)
    }
    return s
  })
}

export function extrairHeuristicaComercial(message: string): {
  termos?: string[]
  limparTipoImovel: boolean
} | null {
  const n = normalizarTextoBusca(message)
  if (!/\blaje\b/.test(n) && !/\bsala\s+comercial\b/.test(n)
    && !( /\bcorporativ/.test(n) && /\b(laje|sala|comercial)\b/.test(n))) {
    return null
  }

  const termos: string[] = []
  if (/\blaje\b/.test(n)) termos.push('laje')
  if (/corporativ|comercial/.test(n)) termos.push('corporativa')

  return {
    termos: termos.length ? [...new Set(termos)] : ['laje'],
    limparTipoImovel: true,
  }
}
