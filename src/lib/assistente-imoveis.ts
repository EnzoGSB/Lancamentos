import { getOpenAIBusca, AI_MODEL_ASSISTENTE } from './openai-busca'
import type { CondicaoAlternativa, FiltrosLancamentos, OpcoesCatalogo } from './lancamentos-query'
import { extrairDormitorios, extrairSuites } from './lancamentos-query'
import {
  extrairEntregaDaMensagem,
  limparFiltrosEntrega,
  mesclarFiltrosEntrega,
} from './entrega-query'
import type { Lancamento } from './types'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export type FiltrosInterpretados = FiltrosLancamentos

export type InterpretacaoBusca = {
  resposta: string
  filtros: FiltrosInterpretados
}

export type ImovelResumo = {
  id: string
  titulo: string
  tipo: string
  empreendimento: string
  construtora: string
  bairro: string | null
  metragem: string | null
  dormitorios: number | null
  suites: number | null
  vagas: string | null
  valor: number | null
  entrega: string | null
  processamento_id: string | null
}

export function lancamentoParaResumo(l: Lancamento): ImovelResumo {
  return {
    id: l.id,
    titulo: `${l.tipologia ?? 'Imóvel'} — ${l.empreendimento}`,
    tipo: l.tipologia?.split(/\s+\d/)[0]?.trim() || l.tipologia || 'Imóvel',
    empreendimento: l.empreendimento,
    construtora: l.construtora,
    bairro: l.bairro,
    metragem: l.metragem,
    dormitorios: extrairDormitorios(l.tipologia),
    suites: extrairSuites(l.tipologia),
    vagas: l.vagas,
    valor: l.valor_minimo ?? l.valor_maximo,
    entrega: l.data_entrega,
    processamento_id: l.processamento_id,
  }
}

function limparCondicao(raw: unknown): CondicaoAlternativa | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const arr = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined
    const items = v.map(String).map(s => s.trim()).filter(Boolean)
    return items.length ? items : undefined
  }

  const cond: CondicaoAlternativa = {}
  const suites = num(o.suites_min ?? o.suites)
  const dorms = num(o.dormitorios_min ?? o.dormitorios)
  if (suites != null) cond.suites_min = suites
  if (dorms != null) cond.dormitorios_min = dorms
  if (o.exige_duplex === true) cond.exige_duplex = true
  const tips = arr(o.tipologia_contem)
  if (tips) cond.tipologia_contem = tips

  if (!cond.suites_min && !cond.dormitorios_min && !cond.exige_duplex && !cond.tipologia_contem?.length) {
    return null
  }
  return cond
}

function limparFiltros(raw: Record<string, unknown>): FiltrosInterpretados {
  const arr = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined
    const items = v.map(String).map(s => s.trim()).filter(Boolean)
    return items.length ? items : undefined
  }

  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const filtros: FiltrosInterpretados = {}

  const q = typeof raw.q === 'string' ? raw.q.trim() : ''
  if (q) filtros.q = q

  const termos = arr(raw.termos)
  if (termos) filtros.termos = termos

  const construtora = arr(raw.construtora)
  const empreendimento = arr(raw.empreendimento)
  const bairro = arr(raw.bairro)
  const tipologia = arr(raw.tipologia)
  if (construtora) filtros.construtora = construtora
  if (empreendimento) filtros.empreendimento = empreendimento
  if (bairro) filtros.bairro = bairro
  if (tipologia) filtros.tipologia = tipologia

  const valorMin = num(raw.valor_min)
  const valorMax = num(raw.valor_max)
  if (valorMin != null) filtros.valor_min = valorMin
  if (valorMax != null) filtros.valor_max = valorMax

  const metMin = num(raw.metragem_min)
  const metMax = num(raw.metragem_max)
  if (metMin != null) filtros.metragem_min = metMin
  if (metMax != null) filtros.metragem_max = metMax

  const dorms = num(raw.dormitorios_min)
  const suites = num(raw.suites_min)
  const vagas = num(raw.vagas_min)
  if (dorms != null && dorms > 0) filtros.dormitorios_min = dorms
  if (suites != null && suites > 0) filtros.suites_min = suites
  if (vagas != null && vagas > 0) filtros.vagas_min = vagas

  if (Array.isArray(raw.condicoes_or)) {
    const condicoes = raw.condicoes_or
      .map(limparCondicao)
      .filter((c): c is CondicaoAlternativa => c != null)
    if (condicoes.length) {
      filtros.condicoes_or = condicoes
      delete filtros.suites_min
      delete filtros.dormitorios_min
    }
  }

  const tipo = raw.tipo_imovel
  if (tipo === 'apartamento' || tipo === 'studio') {
    filtros.tipo_imovel = tipo
    if (tipo === 'apartamento' && (filtros.dormitorios_min == null || filtros.dormitorios_min < 2)) {
      filtros.dormitorios_min = 2
    }
  }

  if (raw.entrega_pronta === true) {
    filtros.entrega_pronta = true
  }

  Object.assign(filtros, limparFiltrosEntrega(raw))

  return filtros
}

function aplicarHeuristicas(message: string, filtros: FiltrosInterpretados): FiltrosInterpretados {
  const entregaHeuristica = extrairEntregaDaMensagem(message)
  let next: FiltrosInterpretados = { ...filtros, ...mesclarFiltrosEntrega(filtros, entregaHeuristica) }

  if (entregaHeuristica.entrega_pronta) {
    if (next.q) {
      const qLimpa = next.q
        .replace(/\blançamentos?\s+prontos?\b/gi, '')
        .replace(/\bimóveis?\s+prontos?\b/gi, '')
        .replace(/\bprontos?\s+para\s+morar\b/gi, '')
        .replace(/\bprontos?\b/gi, '')
        .trim()
      if (qLimpa) next.q = qLimpa
      else delete next.q
    }

    if (next.termos?.length) {
      const termos = next.termos.filter(t => !/^prontos?$/i.test(t.trim()))
      if (termos.length) next.termos = termos
      else delete next.termos
    }
  }

  if (entregaHeuristica.entrega_mes != null || entregaHeuristica.entrega_ano != null
    || entregaHeuristica.entrega_ate_ano != null || entregaHeuristica.entrega_de_ano != null) {
    if (next.q) {
      let qLimpa = next.q
        .replace(/\bentrega\s+(?:em|para|até|ate|a\s+partir\s+de)\s+[^,]+/gi, '')
        .replace(/\bate\s+(?:entrega\s+)?(?:de\s+)?[a-z]{3,9}[/.-]\d{2,4}/gi, '')
        .replace(/\b(?:em|para)\s+\d{4}\b/gi, '')
        .trim()
      if (qLimpa) next.q = qLimpa
      else delete next.q
    }
  }

  return next
}

function resumirOpcoes(opcoes: OpcoesCatalogo) {
  const slice = (items: string[], max = 40) =>
    items.length <= max ? items : [...items.slice(0, max), `... +${items.length - max}`]

  return {
    construtoras: slice(opcoes.construtoras),
    bairros: slice(opcoes.bairros),
    tipologias: slice(opcoes.tipologias, 25),
    empreendimentos: slice(opcoes.empreendimentos, 30),
    entregas: slice(opcoes.entregas, 20),
  }
}

const SYSTEM_PROMPT = `Você é uma IA de busca imobiliária. Sua função é interpretar pedidos em linguagem natural e retornar filtros estruturados para consulta na base REAL de imóveis cadastrados.

NUNCA invente imóveis, valores, metragens, bairros ou empreendimentos. Trabalhe apenas com critérios derivados do pedido do usuário.

## Objetivo
Entenda a intenção, identifique filtros explícitos e implícitos, aplique margem inteligente quando indicado e traduza em JSON para busca no banco.

A busca não deve ser excessivamente rígida, mas também não traga imóveis sem relação com o pedido.

## Metragem (valores numéricos em m², sem sufixo)
- "Entre 21 e 28 metros" → metragem_min: 21, metragem_max: 28 (o sistema aplica +1 m² de tolerância no limite superior automaticamente).
- "Até 70 metros" → metragem_max: 70
- "A partir de 100 metros" → metragem_min: 100
- "De 40 a 50 metros" → metragem_min: 40, metragem_max: 50

## Apartamento vs Studio (regra do catálogo)
- **Apartamento** (apê, apartamento, aparta): imóvel com **2 quartos/dormitórios ou mais**. Use tipo_imovel: "apartamento" e dormitorios_min: 2 (ou mais se o usuário pedir).
- **Studio**: imóvel com **0 ou 1 quarto/dormitório**, ou tipologia "Studio". Use tipo_imovel: "studio".
- "unidade" ou "imóvel" genérico **sem** especificar apartamento/studio → não use tipo_imovel.

## Dormitórios, suítes e tipologia com OR
Quando o usuário usar "ou" entre alternativas, use condicoes_or (cada item é uma condição alternativa — o imóvel precisa atender UMA delas):

Exemplo: "3 suítes ou duplex com 2 suítes"
→ condicoes_or: [
  { "suites_min": 3 },
  { "suites_min": 2, "exige_duplex": true }
]

Quando critérios forem obrigatórios juntos (sem "ou"), use os campos diretos (suites_min, dormitorios_min, vagas_min, etc.).

## Termos equivalentes
- m², metros, metros quadrados, metragem, m → metragem
- apê, apartamento, aparta → tipo_imovel: "apartamento" (2+ quartos)
- studio → tipo_imovel: "studio"
- unidade, imóvel → busca genérica (sem tipo_imovel, salvo contexto)
- suíte, suites, suítes → suites
- dorm, dormitório, quarto, quartos → dormitorios_min
- vaga, vagas, garagem → vagas_min
- duplex → termos: ["duplex"] ou exige_duplex: true

## Busca por referência parcial
Para características como "duplex", "studio", "cobertura", use termos: ["duplex"] — o sistema busca em tipologia, empreendimento, unidade, descrição e demais campos.

## Filtros numéricos de valor
- "até 600 mil" → valor_max: 600000
- "até 2 milhões" ou "até 2M" → valor_max: 2000000
- "a partir de X" → valor_min

## Bairro e catálogo
Use nomes do catálogo fornecido quando possível. Casamento aproximado é permitido.

## Entrega / imóvel pronto / datas de entrega
No catálogo, data_entrega usa formatos como "Pronto", "Mai/2027", "Out/2028", "06/2026".

- "pronto", "prontos", "prontos para morar", "entrega imediata", "lançamentos prontos" → **entrega_pronta: true**
- "entrega em 2027" / "entregue em 2027" → **entrega_ano: 2027** (qualquer mês daquele ano)
- "entrega em maio/2027" / "Mai/2027" → **entrega_mes: 5, entrega_ano: 2027** (meses: jan=1 … dez=12)
- "entrega até maio/2027" / "até 2028" → **entrega_ate_mes** e **entrega_ate_ano** (inclui "Pronto" como entrega mais cedo)
- "a partir de 2028" / "após out/2027" → **entrega_de_mes** e **entrega_de_ano**
- Para casar texto literal do catálogo, use **entrega_contem**: ["Mai/2027"]
- Não confunda com empreendimento cujo nome contém "lançamento" — use os campos de entrega para status/data.

## Resposta ao usuário
Campo "resposta": 1-2 frases em português explicando o que foi buscado. Se aplicou interpretação de OR ou metragem, mencione brevemente. Não invente resultados — só descreva os critérios.

## Formato JSON (sem markdown)
{
  "resposta": "string",
  "filtros": {
    "q": "texto livre opcional",
    "termos": ["duplex"],
    "construtora": [],
    "empreendimento": [],
    "bairro": [],
    "tipologia": [],
    "valor_min": null,
    "valor_max": null,
    "metragem_min": null,
    "metragem_max": null,
    "dormitorios_min": null,
    "suites_min": null,
    "vagas_min": null,
    "tipo_imovel": null,
    "entrega_pronta": null,
    "entrega_mes": null,
    "entrega_ano": null,
    "entrega_ate_mes": null,
    "entrega_ate_ano": null,
    "entrega_de_mes": null,
    "entrega_de_ano": null,
    "entrega_contem": null,
    "condicoes_or": null
  }
}`

export async function interpretarBusca(
  message: string,
  history: ChatTurn[],
  opcoes: OpcoesCatalogo
): Promise<InterpretacaoBusca> {
  const catalogo = resumirOpcoes(opcoes)
  const historico = history.slice(-4)

  const completion = await getOpenAIBusca().chat.completions.create({
    model: AI_MODEL_ASSISTENTE,
    temperature: 0.2,
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Catálogo disponível (use para casar nomes):\n${JSON.stringify(catalogo)}`,
      },
      ...historico.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('Resposta vazia da IA')

  let parsed: { resposta?: string; filtros?: Record<string, unknown> }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Resposta da IA em formato inválido')
  }

  const resposta = typeof parsed.resposta === 'string' && parsed.resposta.trim()
    ? parsed.resposta.trim()
    : 'Busquei imóveis com os critérios que você pediu.'

  return {
    resposta,
    filtros: aplicarHeuristicas(message, limparFiltros(parsed.filtros ?? {})),
  }
}
