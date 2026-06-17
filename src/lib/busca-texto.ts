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

const RE_MINIMO_ANTES = /\b(?:a\s+partir\s+de|no\s+minimo|pelo\s+menos|mais\s+de|acima\s+de|com\s+pelo\s+menos)\s*$/i

function trechoPedeMinimo(textoAntes: string): boolean {
  return RE_MINIMO_ANTES.test(textoAntes.slice(-50).trim())
}

function mencaoPedeMinimo(message: string, reContagem: RegExp): boolean {
  const n = normalizarTextoBusca(message)
  const re = new RegExp(reContagem.source, reContagem.flags.includes('g') ? reContagem.flags : `${reContagem.flags}g`)
  let match: RegExpExecArray | null
  while ((match = re.exec(n)) !== null) {
    const antes = n.slice(Math.max(0, match.index - 50), match.index)
    if (trechoPedeMinimo(antes)) return true
  }
  return false
}

const RE_CONTAGEM_DORM = /(\d+|um|uma|dois|duas|tres|quatro|cinco|seis)\s*(?:quartos?|dormitorios?|dorms?)/gi
const RE_CONTAGEM_SUITE = /(\d+|um|uma|dois|duas|tres|quatro|cinco|seis)\s*suites?/gi

/** Ajusta filtros para contagem exata quando o usuário não pediu mínimo ("3 quartos" → min e max iguais). */
export function ajustarContagensExatas<T extends {
  dormitorios_min?: number | null
  dormitorios_max?: number | null
  suites_min?: number | null
  suites_max?: number | null
  condicoes_or?: Array<{
    dormitorios_min?: number | null
    dormitorios_max?: number | null
    suites_min?: number | null
    suites_max?: number | null
    exige_duplex?: boolean
    tipologia_contem?: string[]
  }>
}>(message: string, filtros: T): T {
  const next = { ...filtros }
  const pedeMinDorm = mencaoPedeMinimo(message, RE_CONTAGEM_DORM)
  const pedeMinSuite = mencaoPedeMinimo(message, RE_CONTAGEM_SUITE)

  const fixContagem = (
    min: number | null | undefined,
    max: number | null | undefined,
    pedeMinimo: boolean
  ): { min?: number | null; max?: number | null } => {
    if (min == null || min <= 0 || max != null || pedeMinimo) {
      return { min, max }
    }
    return { min, max: min }
  }

  if (next.condicoes_or?.length) {
    next.condicoes_or = next.condicoes_or.map(cond => {
      const c = { ...cond }
      const d = fixContagem(c.dormitorios_min, c.dormitorios_max, pedeMinDorm)
      c.dormitorios_min = d.min
      c.dormitorios_max = d.max
      const s = fixContagem(c.suites_min, c.suites_max, pedeMinSuite)
      c.suites_min = s.min
      c.suites_max = s.max
      return c
    })
    return next
  }

  const d = fixContagem(next.dormitorios_min, next.dormitorios_max, pedeMinDorm)
  next.dormitorios_min = d.min
  next.dormitorios_max = d.max
  const s = fixContagem(next.suites_min, next.suites_max, pedeMinSuite)
  next.suites_min = s.min
  next.suites_max = s.max

  return next
}
