import type { Lancamento } from './types'

export const MES_NOME_PARA_NUM: Record<string, number> = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
}

export const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const

export type FiltrosEntrega = {
  entrega_pronta?: boolean
  entrega_mes?: number
  entrega_ano?: number
  entrega_ate_mes?: number
  entrega_ate_ano?: number
  entrega_de_mes?: number
  entrega_de_ano?: number
  entrega_contem?: string[]
}

export type DataEntregaParsed = { mes: number; ano: number } | 'pronto' | null

export function normalizarAno(ano: number): number | null {
  if (!Number.isFinite(ano)) return null
  if (ano < 100) return 2000 + ano
  if (ano >= 2000 && ano <= 2100) return ano
  return null
}

export function mesNomeParaNum(nome: string): number | null {
  const key = nome.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return MES_NOME_PARA_NUM[key] ?? null
}

export function isEntregaPronta(val: string | null | undefined): boolean {
  if (!val?.trim()) return false
  return /^pront[oa]s?(\s+para\s+morar)?$/i.test(val.trim())
}

export function parseDataEntrega(val: string | null | undefined): DataEntregaParsed {
  if (!val?.trim()) return null
  if (isEntregaPronta(val)) return 'pronto'

  const s = val.trim()

  const mesAnoTexto = s.match(/^([A-Za-z]{3,9})[/.-](\d{2,4})$/i)
  if (mesAnoTexto) {
    const mes = mesNomeParaNum(mesAnoTexto[1])
    const ano = normalizarAno(parseInt(mesAnoTexto[2], 10))
    if (mes && ano) return { mes, ano }
  }

  const numMesAno = s.match(/^(\d{1,2})[/.-](\d{2,4})$/)
  if (numMesAno) {
    const mes = parseInt(numMesAno[1], 10)
    const ano = normalizarAno(parseInt(numMesAno[2], 10))
    if (mes >= 1 && mes <= 12 && ano) return { mes, ano }
  }

  const soAno = s.match(/^(\d{4})$/)
  if (soAno) {
    const ano = normalizarAno(parseInt(soAno[1], 10))
    if (ano) return { mes: 12, ano }
  }

  return null
}

export function chaveEntrega(mes: number, ano: number): number {
  return ano * 12 + mes
}

export function temFiltroEntrega(f: FiltrosEntrega): boolean {
  return f.entrega_pronta === true
    || f.entrega_mes != null
    || f.entrega_ano != null
    || f.entrega_ate_ano != null
    || f.entrega_de_ano != null
    || (f.entrega_contem?.length ?? 0) > 0
}

export function matchesFiltroEntrega(
  dataEntrega: string | null | undefined,
  filtros: FiltrosEntrega
): boolean {
  if (!temFiltroEntrega(filtros)) return true

  const raw = (dataEntrega ?? '').trim()
  const parsed = parseDataEntrega(dataEntrega)

  if (filtros.entrega_contem?.length) {
    const lower = raw.toLowerCase()
    if (!filtros.entrega_contem.some(t => lower.includes(t.toLowerCase()))) {
      const sóContem = !filtros.entrega_pronta
        && filtros.entrega_mes == null
        && filtros.entrega_ano == null
        && filtros.entrega_ate_ano == null
        && filtros.entrega_de_ano == null
      if (sóContem) return false
    }
  }

  if (filtros.entrega_pronta) {
    if (!isEntregaPronta(dataEntrega)) return false
  }

  const temFiltroData = filtros.entrega_mes != null
    || filtros.entrega_ano != null
    || filtros.entrega_ate_ano != null
    || filtros.entrega_de_ano != null

  if (!temFiltroData) return true

  if (parsed === 'pronto') {
    if (filtros.entrega_ate_ano != null) return true
    return false
  }

  if (parsed === null) return false

  if (filtros.entrega_mes != null && filtros.entrega_ano != null) {
    if (parsed.mes !== filtros.entrega_mes || parsed.ano !== filtros.entrega_ano) return false
  } else if (filtros.entrega_ano != null) {
    if (parsed.ano !== filtros.entrega_ano) return false
  }

  const itemKey = chaveEntrega(parsed.mes, parsed.ano)

  if (filtros.entrega_ate_ano != null) {
    const ateMes = filtros.entrega_ate_mes ?? 12
    if (itemKey > chaveEntrega(ateMes, filtros.entrega_ate_ano)) return false
  }

  if (filtros.entrega_de_ano != null) {
    const deMes = filtros.entrega_de_mes ?? 1
    if (itemKey < chaveEntrega(deMes, filtros.entrega_de_ano)) return false
  }

  return true
}

export function isImovelPronto(l: Lancamento): boolean {
  return isEntregaPronta(l.data_entrega)
}

export function padroesEntregaSql(filtros: FiltrosEntrega): string[] {
  const padroes: string[] = []

  if (filtros.entrega_pronta) padroes.push('%pronto%')

  if (filtros.entrega_ano != null) {
    padroes.push(`%/${filtros.entrega_ano}%`)
    padroes.push(`%${filtros.entrega_ano}%`)
  }

  if (filtros.entrega_mes != null && filtros.entrega_ano != null) {
    const abrev = MES_ABREV[filtros.entrega_mes - 1]
    if (abrev) {
      padroes.push(`%${abrev}/${filtros.entrega_ano}%`)
      padroes.push(`%${abrev.toLowerCase()}/${filtros.entrega_ano}%`)
    }
    padroes.push(`%${String(filtros.entrega_mes).padStart(2, '0')}/${filtros.entrega_ano}%`)
  }

  for (const t of filtros.entrega_contem ?? []) {
    if (t.trim()) padroes.push(`%${t.trim()}%`)
  }

  return [...new Set(padroes)]
}

export function extrairEntregaDaMensagem(message: string): FiltrosEntrega {
  const m = message.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const out: FiltrosEntrega = {}

  const pedePronto =
    /\bprontos?\s+para\s+morar\b/.test(m)
    || (/\bprontos?\b/.test(m) && /\b(lancamentos?|imoveis?|unidades?|entrega)\b/.test(m))
    || (message.trim().length <= 48 && /\bprontos?\b/.test(m))

  if (pedePronto) out.entrega_pronta = true

  const ateMesAno = m.match(/\bate\s+(?:entrega\s+)?(?:de\s+)?([a-z]{3,9}|\d{1,2})[/.-](\d{2,4})\b/)
  if (ateMesAno) {
    const mes = /^\d/.test(ateMesAno[1])
      ? parseInt(ateMesAno[1], 10)
      : mesNomeParaNum(ateMesAno[1])
    const ano = normalizarAno(parseInt(ateMesAno[2], 10))
    if (mes && ano) {
      out.entrega_ate_mes = mes
      out.entrega_ate_ano = ano
    }
  } else {
    const ateAno = m.match(/\bate\s+(?:entrega\s+)?(?:de\s+)?(\d{4})\b/)
    if (ateAno) {
      const ano = normalizarAno(parseInt(ateAno[1], 10))
      if (ano) out.entrega_ate_ano = ano
    }
  }

  const deMesAno = m.match(/\b(?:a\s+partir\s+de|apos|depois\s+de)\s+(?:entrega\s+)?([a-z]{3,9}|\d{1,2})[/.-](\d{2,4})\b/)
  if (deMesAno) {
    const mes = /^\d/.test(deMesAno[1])
      ? parseInt(deMesAno[1], 10)
      : mesNomeParaNum(deMesAno[1])
    const ano = normalizarAno(parseInt(deMesAno[2], 10))
    if (mes && ano) {
      out.entrega_de_mes = mes
      out.entrega_de_ano = ano
    }
  }

  const emMesAno = m.match(/\b(?:entrega\s+(?:em|para)|entregue\s+em)\s+([a-z]{3,9}|\d{1,2})[/.-](\d{2,4})\b/)
  if (emMesAno && !out.entrega_ate_ano && !out.entrega_de_ano) {
    const mes = /^\d/.test(emMesAno[1])
      ? parseInt(emMesAno[1], 10)
      : mesNomeParaNum(emMesAno[1])
    const ano = normalizarAno(parseInt(emMesAno[2], 10))
    if (mes && ano) {
      out.entrega_mes = mes
      out.entrega_ano = ano
      out.entrega_contem = [`${MES_ABREV[mes - 1]}/${ano}`]
    }
  } else {
    const emAno = m.match(/\b(?:entrega\s+(?:em|para)|entregue\s+em)\s+(\d{4})\b/)
    if (emAno && !out.entrega_ate_ano) {
      const ano = normalizarAno(parseInt(emAno[1], 10))
      if (ano) {
        out.entrega_ano = ano
        out.entrega_contem = [String(ano)]
      }
    }
  }

  return out
}

export function limparFiltrosEntrega(raw: Record<string, unknown>): FiltrosEntrega {
  const num = (v: unknown, min = 0, max = Infinity): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }

  const arr = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined
    const items = v.map(String).map(s => s.trim()).filter(Boolean)
    return items.length ? items : undefined
  }

  const filtros: FiltrosEntrega = {}

  if (raw.entrega_pronta === true) filtros.entrega_pronta = true

  const mes = num(raw.entrega_mes, 1, 12)
  const ano = num(raw.entrega_ano, 2000, 2100)
  if (mes != null) filtros.entrega_mes = mes
  if (ano != null) filtros.entrega_ano = ano

  const ateMes = num(raw.entrega_ate_mes, 1, 12)
  const ateAno = num(raw.entrega_ate_ano, 2000, 2100)
  if (ateMes != null) filtros.entrega_ate_mes = ateMes
  if (ateAno != null) filtros.entrega_ate_ano = ateAno

  const deMes = num(raw.entrega_de_mes, 1, 12)
  const deAno = num(raw.entrega_de_ano, 2000, 2100)
  if (deMes != null) filtros.entrega_de_mes = deMes
  if (deAno != null) filtros.entrega_de_ano = deAno

  const contem = arr(raw.entrega_contem)
  if (contem) filtros.entrega_contem = contem

  return filtros
}

export function mesclarFiltrosEntrega(base: FiltrosEntrega, extra: FiltrosEntrega): FiltrosEntrega {
  return { ...base, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v != null && v !== false)) }
}
