import sharp from 'sharp'
import { openai, AI_MODEL_ANALYZER, AI_MODEL_EXTRACTOR } from './openai'
import { createPDFParser } from './pdf-parse-server'
import type { AnaliseIA, LancamentoAI } from './types'

const LANCAMENTO_SCHEMA = `{
  "construtora": "nome da construtora",
  "empreendimento": "nome do empreendimento",
  "endereco": "logradouro e número ou null",
  "bairro": "bairro ou null",
  "data_entrega": "ex: Maio/2029, 12/2028, Pronto ou null",
  "metragem": "ex: 22-23m², 372,99m², 47-64m² ou null",
  "tipologia": "ex: Studio, 1 dorm, 2 dorms, 2 suítes, 3 suítes, 4 suítes, Duplex, Garden, Loft, NR ou null",
  "unidade": "ex: 72-T2, 112, Ap. 501 ou null — valor das colunas Unidade, Apto, Ap., Apartamento ou identificador equivalente",
  "andar": "ex: 3º, 12º andar, Térreo, Cobertura, 1º-26º ou null — APENAS pavimento/nível (não confundir com código de unidade)",
  "vagas": "ex: 0, 0-1, 2, 4 ou null",
  "valor_minimo": número sem R$ sem pontos de milhar (ex: 503146) ou null,
  "valor_maximo": número ou null (null se igual ao mínimo),
  "desconto_margem": "ex: 10%, 3% a 22% ou null",
  "mais_detalhes": objeto JSON livre com informações extras ou null
}`

const SYSTEM_PROMPT_SINGLE = `Você é um especialista em extração de dados de tabelas de vendas imobiliárias brasileiras.
Você está VENDO o PDF completo de UM empreendimento. Extraia UMA linha por tipologia de imóvel, consolidando os dados de todas as páginas.

Cada lançamento segue este schema:
${LANCAMENTO_SCHEMA}

Regras críticas:
1. Uma linha por tipologia ou variante (Studio, 1 dorm, 2 dorms, 2 dorms FINAL 2, 2 suítes, etc.). Variantes distintas (FINAL 1, FINAL 2, metragens diferentes) = linhas separadas na tipologia.
2. NÃO ignore tipologias com suítes — "2 SUÍTES", "3 SUÍTES" são tão válidas quanto "2 dorms"
3. IGNORE completamente: KIT CONFORTO, KIT AUTOMAÇÃO, KIT DE ACABAMENTO, KIT BÁSICO e qualquer "kit" — são pacotes adicionais, NÃO são imóveis
4. Páginas com tabelas UNIDADES + PREÇO DE VENDA por andar (mesmo com colunas ATO/MENSAIS/FINANCIAMENTO) contêm dados de imóvel — extraia TODAS as tipologias de TODAS as páginas, inclusive páginas 9 em diante.
5. Para tabelas com valores por andar (ex: "1º andar R$856.781 ... 26º andar R$985.299"), agrupe por variante: valor_minimo=menor PREÇO DE VENDA, valor_maximo=maior, andar=faixa "1º-26º"
6. valor_minimo e valor_maximo são números puros sem R$, sem pontos de milhar (ex: 503146)
7. CAMPO unidade: colunas Unidade/Apto/Ap./Apartamento. Coluna UNIDADES com "1º andar" → use andar, não unidade.
8. CAMPO andar: pavimento/nível (3º, 12º andar, Térreo, 1º-26º).
9. Para tabelas de pagamento (ATO, parcelas, financiamento, juros), coloque um resumo em mais_detalhes
10. TEXTO NATIVO: nomes e valores EXATOS do documento inteiro. Use para não perder tipologias em nenhuma página.
11. Se um campo não existe, use null — NÃO invente dados

Responda APENAS com JSON válido, sem markdown:
{"lancamentos": [...]}`

const SYSTEM_PROMPT_SINGLE_FAIXA = `Você é um especialista em extração de dados de tabelas de vendas imobiliárias brasileiras.
A imagem é uma FAIXA (recorte horizontal) de uma página de um PDF de UM ÚNICO empreendimento. Leia a tabela visualmente e extraia TODOS os blocos de tipologia visíveis nesta faixa.

Cada lançamento segue este schema:
${LANCAMENTO_SCHEMA}

Regras CRÍTICAS:
1. Extraia TODOS os blocos visíveis nesta faixa — NÃO pare no primeiro. Páginas posteriores (ex: 9–14) costumam ter tipologias adicionais (2 DORM - FINAL 1, FINAL 2, etc.) — trate cada bloco como dado de imóvel.
2. Tabelas com coluna UNIDADES (andares 1º–26º), ÁREA PRIVATIVA, PREÇO DE VENDA e colunas de pagamento (ATO, MENSAIS, FINANCIAMENTO) são tabelas de PREÇO DE UNIDADES — NÃO descarte por parecer "só pagamento". O PREÇO DE VENDA de cada andar é o valor do imóvel.
3. Variantes distintas (ex: "2 DORM - FINAL 1" vs "2 DORM - FINAL 2", metragens diferentes) = LINHAS SEPARADAS. Inclua o sufixo completo na tipologia (ex: "2 dorms FINAL 2").
4. Bloco com preços por andar: UMA linha por variante — valor_minimo = menor PREÇO DE VENDA da coluna, valor_maximo = maior, andar = faixa "1º-26º" (ou intervalo visível), metragem da coluna ÁREA PRIVATIVA, vagas da coluna VAGAS.
5. IGNORE KIT CONFORTO, KIT AUTOMAÇÃO, KIT DE ACABAMENTO e qualquer "kit" — não são imóveis.
6. CAMPO unidade: colunas Unidade/Apto/Ap./Apartamento quando existirem. Coluna UNIDADES com "1º andar", "2º andar" → use andar, não unidade.
7. CAMPO andar: pavimento/nível (3º, 12º andar, 1º-26º). Não confunda com código de apartamento.
8. valor_minimo e valor_maximo: números puros sem R$, sem pontos de milhar.
9. Resumo de parcelas/condições de pagamento → mais_detalhes (não crie linha extra por parcela).
10. TEXTO NATIVO: dicionário do documento inteiro para nomes/valores EXATOS. Extraia APENAS blocos VISÍVEIS nesta faixa; use o texto para escrever corretamente tipologia, metragem e preços.
11. Se um campo não existe, use null — NÃO invente dados.

Responda APENAS com JSON válido, sem markdown:
{"lancamentos": [...]}`

const SYSTEM_PROMPT_MULTI = `Você é um especialista em extração de dados de tabelas de vendas imobiliárias brasileiras.
A imagem é uma FAIXA (recorte horizontal) de uma página de um tabelão com VÁRIOS empreendimentos. Cada tabelão tem um layout próprio (retrato ou paisagem, número de colunas variável). Leia a tabela visualmente, respeitando o alinhamento das colunas, e extraia TODAS as linhas de dados visíveis nesta faixa.

Cada lançamento segue este schema:
${LANCAMENTO_SCHEMA}

Regras CRÍTICAS (genéricas — valem para qualquer formato de tabelão):
1. CÉLULAS MESCLADAS: as colunas à esquerda (região, bairro e/ou empreendimento) frequentemente usam células mescladas que cobrem várias linhas de dados. Cada linha herda esses valores da célula mesclada imediatamente acima/à esquerda. NÃO propague o nome de um empreendimento para linhas que pertencem a OUTRO empreendimento — o valor muda quando começa um novo bloco.
2. EXTRAIA TODOS os empreendimentos e TODAS as linhas de dados desta faixa — NÃO descarte nenhum bloco, mesmo que o layout seja incomum. Blocos pequenos no meio ou no fim da faixa também contam — não pare após o primeiro empreendimento.
3. AGREGUE POR TIPOLOGIA somente quando várias linhas VISÍVEIS forem claramente o MESMO empreendimento com a MESMA tipologia e metragem (ex.: andares diferentes, preços diferentes). Se cada linha da tabela representa um empreendimento distinto ou uma combinação única empreendimento+tipologia, produza UMA linha JSON por linha visível — NÃO consolide empreendimentos diferentes.
4. CAMPO unidade: valor das colunas Unidade, Apto, Ap., Apartamento ou identificador equivalente (ex: 72-T2, 112, 133). Uma linha por unidade/apartamento listado na tabela.
5. CAMPO andar: APENAS pavimento/nível (ex: 3º, 12º andar, Térreo, Cobertura). Faixa → "1º-26º". Não coloque código de unidade/apartamento aqui.
6. Se esta FAIXA cortou o cabeçalho de região/empreendimento, descubra o bairro pelo ENDEREÇO da linha (a rua indica o bairro) ou pelo TEXTO NATIVO. NUNCA repita cegamente o valor da linha anterior se houver dúvida.
7. SEMPRE preencha empreendimento, bairro e data_entrega quando a informação existir.
8. NÃO use o nome da construtora como substituto para empreendimento.
9. valor_minimo e valor_maximo são números puros sem R$, sem pontos de milhar (ex: 1625000).
10. IGNORE cabeçalhos de coluna, rodapés, notas e texto explicativo — apenas linhas de dados de imóveis.
11. TEXTO NATIVO: você recebe o TEXTO NATIVO do PDF (nomes e valores EXATOS, mas referente ao DOCUMENTO INTEIRO, fora de ordem). REGRA ABSOLUTA: extraia EXCLUSIVAMENTE as linhas que aparecem VISUALMENTE NESTA FAIXA da imagem. O texto nativo serve APENAS como dicionário para escrever corretamente os NOMES e VALORES das linhas que você VÊ na imagem — NÃO adicione linhas que não estão visíveis nesta faixa. NUNCA invente um nome que não apareça no texto nativo.
12. CAMPO bairro: normalize como "Bairro, Cidade" (vírgula). Ex: "Vila da Saúde, São Paulo".
13. CAMPO empreendimento: nome limpo, sem sufixos espúrios ("*", "¹", notas de rodapé).

Responda APENAS com JSON válido, sem markdown:
{"lancamentos": [...]}`

export async function analisarPDF(texto: string, filename = ''): Promise<AnaliseIA> {
  const completion = await openai.chat.completions.create({
    model: AI_MODEL_ANALYZER,
    messages: [
      {
        role: 'system',
        content: `Você analisa textos extraídos de PDFs de tabelas de vendas imobiliárias brasileiras.
Classifique o documento e identifique os empreendimentos presentes.

Responda APENAS com JSON válido, sem markdown:
{
  "tipo": "single" ou "multi",
  "construtora": "nome da construtora principal",
  "empreendimentos_identificados": ["lista", "de", "nomes"],
  "resumo": "uma frase descrevendo o documento"
}

- "single": PDF dedicado a UM empreendimento (pode ter múltiplas tipologias e tabelas de pagamento detalhadas)
- "multi": PDF com VÁRIOS empreendimentos listados em tabela (tabelão de construtora ou parceira)

REGRA PARA construtora:
- Use a MARCA da construtora/incorporadora (ex: Lindenberg, Cyrela, Tibério, Vitaurbana), NUNCA a razão social do rodapé (ex: "Ilha Bella Incorporadora Ltda.").
- O NOME DO ARQUIVO costuma conter a construtora — use-o como forte indício.
- Se não conseguir identificar com confiança, infira do nome do arquivo.`,
      },
      {
        role: 'user',
        content: `Nome do arquivo: "${filename}"\n\nTexto extraído do PDF:\n\n${texto.substring(0, 16000)}`,
      },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('Resposta vazia do Agente Analisador')
  return JSON.parse(content) as AnaliseIA
}

// Renderiza as páginas do PDF em alta resolução e retorna os PNGs (Buffer)
async function renderizarPaginas(buffer: Buffer): Promise<Buffer[]> {
  const parser = createPDFParser(buffer)
  const result = await parser.getScreenshot({ scale: 3, base64: true } as { scale: number })

  return (result.pages ?? []).map((p: { dataUrl?: string; base64?: string }) => {
    const b64 = (p.dataUrl ?? `data:image/png;base64,${p.base64}`).replace(/^data:image\/png;base64,/, '')
    return Buffer.from(b64, 'base64')
  })
}

// Corta um PNG em N faixas horizontais com sobreposição (para não cortar linhas no meio).
// Tiling aumenta a resolução efetiva por linha e reduz erros de associação em tabelas densas.
async function cortarEmFaixas(png: Buffer, n = 3, overlapPct = 0.03): Promise<Buffer[]> {
  const meta = await sharp(png).metadata()
  const height = meta.height ?? 0
  const width = meta.width ?? 0
  if (!height || !width || n <= 1) return [png]

  const faixaH = Math.ceil(height / n)
  const overlap = Math.floor(height * overlapPct)
  const faixas: Buffer[] = []
  for (let i = 0; i < n; i++) {
    const top = Math.max(0, i * faixaH - overlap)
    const h = Math.min(height - top, faixaH + overlap * 2)
    if (h <= 0) continue
    faixas.push(await sharp(png).extract({ left: 0, top, width, height: h }).png().toBuffer())
  }
  return faixas
}

// SINGLE: um empreendimento, tipologias em várias páginas (ex: Metropolitan).
// PDFs com 3+ páginas → renderiza + tiling (mesma técnica do multi) para não perder
// páginas densas de preço (ex: 9–14). PDFs curtos → PDF inteiro numa chamada.
export async function processarSingle(buffer: Buffer, analise: AnaliseIA, textoNativo = ''): Promise<LancamentoAI[]> {
  const contextoBase = [
    `Construtora: ${analise.construtora}`,
    `Empreendimento: ${analise.empreendimentos_identificados[0] ?? 'identifique no PDF'}`,
    analise.empreendimentos_identificados.length > 1
      ? `Nomes também presentes no documento: ${analise.empreendimentos_identificados.join(', ')}`
      : null,
    analise.resumo ? `Resumo: ${analise.resumo}` : null,
  ].filter(Boolean).join('\n')

  const paginas = await renderizarPaginas(buffer)

  if (paginas.length <= 2) {
    const pdfBase64 = buffer.toString('base64')
    const result = await _extrairDePdf(SYSTEM_PROMPT_SINGLE, pdfBase64, contextoBase, textoNativo)
    return deduplicar(result)
  }

  const numFaixas = paginas.length >= 10 ? 4 : paginas.length >= 6 ? 3 : 2
  const totalPaginas = paginas.length

  type FaixaJob = { png: Buffer; pagina: number }
  const faixasPorPagina = await Promise.all(
    paginas.map(async (png, i) => {
      const faixas = await cortarEmFaixas(png, numFaixas)
      return faixas.map(f => ({ png: f, pagina: i + 1 }))
    })
  )
  const jobs: FaixaJob[] = faixasPorPagina.flat()

  const bruto = (await mapWithConcurrency(
    jobs,
    4,
    ({ png, pagina }) => {
      const contexto = `${contextoBase}\nPágina ${pagina} de ${totalPaginas}. Extraia todos os blocos de tipologia visíveis nesta faixa — inclusive tabelas de PREÇO DE VENDA por andar.`
      return _extrairDeImagem(SYSTEM_PROMPT_SINGLE_FAIXA, png, contexto, textoNativo)
    }
  )).flat()

  return deduplicar(bruto)
}

// MULTI: tabelas densas e hierárquicas → renderiza cada página em alta resolução,
// corta em faixas horizontais (tiling) e processa cada faixa. Tiling dá mais
// resolução por linha e reduz erros de associação. Envia também o texto nativo
// (nomes/valores exatos) para evitar alucinação.
export async function processarMulti(buffer: Buffer, analise: AnaliseIA, textoNativo = ''): Promise<LancamentoAI[]> {
  const paginas = await renderizarPaginas(buffer)
  const listaEmpreendimentos = analise.empreendimentos_identificados?.length
    ? analise.empreendimentos_identificados.join(', ')
    : 'identifique todos no PDF'
  const contexto = [
    `Construtora principal: ${analise.construtora}`,
    `Empreendimentos no documento (${analise.empreendimentos_identificados?.length ?? '?'}): ${listaEmpreendimentos}`,
    analise.resumo ? `Resumo: ${analise.resumo}` : null,
    'Extraia TODOS os empreendimentos visíveis nesta faixa — inclusive blocos menores no meio/fim da tabela.',
  ].filter(Boolean).join('\n')

  // Cada página vira N faixas; processa com concorrência limitada para evitar falhas silenciosas.
  // Mais faixas em tabelões densos → menos linhas por chamada, menos risco de truncar/omitir.
  const numFaixas = (analise.empreendimentos_identificados?.length ?? 0) >= 45 ? 5
    : (analise.empreendimentos_identificados?.length ?? 0) >= 30 ? 4
    : 3

  const faixasPorPagina = await Promise.all(paginas.map(png => cortarEmFaixas(png, numFaixas)))
  const todasFaixas = faixasPorPagina.flat()

  const bruto = (await mapWithConcurrency(
    todasFaixas,
    4,
    faixa => _extrairDeImagem(SYSTEM_PROMPT_MULTI, faixa, contexto, textoNativo)
  )).flat()

  return deduplicar(bruto)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  )
  return results
}

// Consolida por (empreendimento + tipologia + metragem): mescla entradas com a mesma
// chave em vez de descartar. Preserva a faixa de valores (valor_minimo/maximo) quando há
// várias linhas da mesma tipologia (ex: Danti) e remove duplicatas de overlap das faixas.
function deduplicar(lancamentos: LancamentoAI[]): LancamentoAI[] {
  // Normaliza texto: minúsculo, só letras/números (remove pipes, pontuação, espaços).
  const norm = (s: string | null | undefined) =>
    (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  // Normaliza metragem para os números principais (robusto a "Garden 167m²" vs "167m²").
  const normMetragem = (s: string | null | undefined) =>
    ((s ?? '').match(/\d+[.,]?\d*/g) ?? []).map(n => n.replace(',', '.')).join('-')

  const toNum = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const chave = (l: LancamentoAI) => {
    const emp = norm(l.empreendimento)
    const bairro = norm(l.bairro)
    const endereco = norm(l.endereco).slice(0, 24)
    const tip = norm(l.tipologia)
    const met = normMetragem(l.metragem)
    const unidade = norm(l.unidade)
    const andar = norm(l.andar)
    // Inclui bairro/endereço para não colapsar empreendimentos distintos quando o nome vem vazio.
    if (!emp) {
      const val = toNum(l.valor_minimo)
      return `|${bairro}|${endereco}|${tip}|${met}|${unidade}|${andar}|${val ?? ''}`
    }
    return `${emp}|${bairro}|${tip}|${met}|${unidade}|${andar}`
  }

  const map = new Map<string, LancamentoAI>()
  for (const l of lancamentos) {
    const k = chave(l)
    const existing = map.get(k)
    if (!existing) {
      map.set(k, { ...l })
      continue
    }

    // Preços distintos = linhas distintas (evita colapsar empreendimentos diferentes com nomes similares).
    const vExist = toNum(existing.valor_minimo)
    const vNovo = toNum(l.valor_minimo)
    if (vExist != null && vNovo != null) {
      const base = Math.max(vExist, vNovo, 1)
      if (Math.abs(vExist - vNovo) / base > 0.03) {
        map.set(`${k}|${vNovo}`, { ...l })
        continue
      }
    }

    // Consolida a faixa de valores
    const mins = [toNum(existing.valor_minimo), toNum(l.valor_minimo)].filter((n): n is number => n != null)
    const maxs = [toNum(existing.valor_maximo), toNum(l.valor_maximo), ...mins].filter((n): n is number => n != null)
    if (mins.length) existing.valor_minimo = Math.min(...mins)
    if (maxs.length) existing.valor_maximo = Math.max(...maxs)

    // Preenche campos que estiverem vazios na entrada existente
    for (const [campo, valor] of Object.entries(l) as [keyof LancamentoAI, unknown][]) {
      if (campo === 'valor_minimo' || campo === 'valor_maximo') continue
      const atual = existing[campo]
      if ((atual == null || atual === '') && valor != null && valor !== '') {
        ;(existing as Record<string, unknown>)[campo] = valor
      }
    }
  }
  return Array.from(map.values())
}

// Extração a partir do PDF inteiro (visão nativa) — usado no fluxo single
async function _extrairDePdf(
  systemPrompt: string,
  pdfBase64: string,
  contexto: string,
  textoNativo = ''
): Promise<LancamentoAI[]> {
  try {
    const blocoTexto = textoNativo
      ? `\n\nTEXTO NATIVO DO PDF (referência do DOCUMENTO INTEIRO — nomes e valores EXATOS). Use para confirmar tipologias em todas as páginas:\n${textoNativo.substring(0, 40000)}`
      : ''

    const completion = await openai.chat.completions.create({
      model: AI_MODEL_EXTRACTOR,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'documento.pdf',
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
            { type: 'text', text: `${contexto}\n\nExtraia todas as tipologias deste empreendimento, uma por linha.${blocoTexto}` },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 16000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return []

    if (completion.choices[0]?.finish_reason === 'length') {
      console.error('[extrairDePdf] resposta truncada (max_tokens) — tipologias podem ter sido omitidas')
    }

    const parsed = JSON.parse(content)
    return (parsed.lancamentos ?? []) as LancamentoAI[]
  } catch (err) {
    console.error('[extrairDePdf] falha na extração:', err)
    return []
  }
}

// Extração a partir de UMA faixa (tile) de página em alta resolução — usado no fluxo multi.
// Inclui o texto nativo do PDF (nomes/valores exatos) para evitar alucinação de nomes.
async function _extrairDeImagem(
  systemPrompt: string,
  png: Buffer,
  contexto: string,
  textoNativo = ''
): Promise<LancamentoAI[]> {
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  const blocoTexto = textoNativo
    ? `\n\nTEXTO NATIVO DO PDF (dicionário do DOCUMENTO INTEIRO — nomes e valores EXATOS, fora de ordem). Use-o APENAS para escrever corretamente os nomes/valores das linhas que você VÊ nesta faixa; NÃO adicione linhas que não estão visíveis na imagem; NUNCA invente nomes:\n${textoNativo.substring(0, 40000)}`
    : ''

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: AI_MODEL_EXTRACTOR,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              { type: 'text', text: `${contexto}\n\nEsta imagem é uma FAIXA (recorte horizontal) de uma página. Extraia EXCLUSIVAMENTE as linhas de dados VISÍVEIS nesta faixa, sem pular nenhuma e sem adicionar linhas de fora.${blocoTexto}` },
            ],
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 16000,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) continue

      if (completion.choices[0]?.finish_reason === 'length') {
        console.error('[extrairDeImagem] resposta truncada (max_tokens) — faixa pode ter linhas omitidas')
      }

      const parsed = JSON.parse(content)
      return (parsed.lancamentos ?? []) as LancamentoAI[]
    } catch (err) {
      if (attempt === 1) {
        console.error('[extrairDeImagem] falha na faixa após retry:', err)
      }
    }
  }

  return []
}
