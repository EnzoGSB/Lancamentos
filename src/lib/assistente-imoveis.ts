import { getOpenAIBusca, AI_MODEL_ASSISTENTE } from './openai-busca'
import type { FiltrosLancamentos, OpcoesCatalogo } from './lancamentos-query'
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
}

function extrairNumeroTipologia(tipologia: string | null, padrao: RegExp): number | null {
  if (!tipologia) return null
  const m = tipologia.match(padrao)
  return m ? parseInt(m[1], 10) : null
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
    dormitorios: extrairNumeroTipologia(l.tipologia, /(\d+)\s*dorms?/i),
    suites: extrairNumeroTipologia(l.tipologia, /(\d+)\s*suítes?/i),
    vagas: l.vagas,
    valor: l.valor_minimo ?? l.valor_maximo,
    entrega: l.data_entrega,
  }
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

  const dorms = num(raw.dormitorios_min)
  const suites = num(raw.suites_min)
  const vagas = num(raw.vagas_min)
  if (dorms != null && dorms > 0) filtros.dormitorios_min = dorms
  if (suites != null && suites > 0) filtros.suites_min = suites
  if (vagas != null && vagas > 0) filtros.vagas_min = vagas

  return filtros
}

function resumirOpcoes(opcoes: OpcoesCatalogo) {
  const slice = (items: string[], max = 40) =>
    items.length <= max ? items : [...items.slice(0, max), `... +${items.length - max}`]

  return {
    construtoras: slice(opcoes.construtoras),
    bairros: slice(opcoes.bairros),
    tipologias: slice(opcoes.tipologias, 25),
    empreendimentos: slice(opcoes.empreendimentos, 30),
  }
}

const SYSTEM_PROMPT = `Você é um assistente de busca de imóveis de lançamento no mercado imobiliário brasileiro.
Sua função é interpretar pedidos em linguagem natural e devolver filtros estruturados para consulta no banco de dados.

REGRAS:
- Responda SEMPRE em JSON válido, sem markdown.
- Use nomes de bairro, construtora, empreendimento e tipologia que existam no catálogo quando possível (lista fornecida).
- "até X milhões" → valor_max = X * 1000000. "até 2M" ou "até 2 milhões" → valor_max = 2000000.
- "a partir de X" → valor_min.
- "3 quartos" ou "3 dormitórios" → dormitorios_min = 3.
- "2 suítes" → suites_min = 2.
- "2 vagas" → vagas_min = 2.
- Studio → tipologia contendo "Studio".
- Se o usuário mencionar bairro/região, use o array bairro com o nome mais próximo do catálogo.
- Se não houver critério claro, deixe campos vazios ou null — não invente filtros.
- resposta: frase curta e amigável em português explicando o que você buscou (1-2 frases).

Formato JSON:
{
  "resposta": "string",
  "filtros": {
    "q": "texto livre opcional",
    "construtora": ["..."],
    "empreendimento": ["..."],
    "bairro": ["..."],
    "tipologia": ["..."],
    "valor_min": null,
    "valor_max": null,
    "dormitorios_min": null,
    "suites_min": null,
    "vagas_min": null
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
    max_tokens: 500,
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
    filtros: limparFiltros(parsed.filtros ?? {}),
  }
}
