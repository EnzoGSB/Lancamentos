import sharp from 'sharp'
import { openai, AI_MODEL_ANALYZER, AI_MODEL_EXTRACTOR } from './openai'
import type { AnaliseIA, LancamentoAI } from './types'

const LANCAMENTO_SCHEMA = `{
  "construtora": "nome da construtora",
  "empreendimento": "nome do empreendimento",
  "endereco": "logradouro e número ou null",
  "bairro": "bairro ou null",
  "data_entrega": "ex: Maio/2029, 12/2028, Pronto ou null",
  "metragem": "ex: 22-23m², 372,99m², 47-64m² ou null",
  "tipologia": "ex: Studio, 1 dorm, 2 dorms, 2 suítes, 3 suítes, 4 suítes, Duplex, Garden, Loft, NR ou null",
  "vagas": "ex: 0, 0-1, 2, 4 ou null",
  "unidades": número inteiro ou null,
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
1. Uma linha por tipologia (Studio, 1 dorm, 2 dorms, 2 suítes, 3 suítes, 4 suítes, Duplex, Garden, Loft, NR, etc.)
2. NÃO ignore tipologias com suítes — "2 SUÍTES", "3 SUÍTES" são tão válidas quanto "2 dorms"
3. IGNORE completamente: KIT CONFORTO, KIT AUTOMAÇÃO, KIT DE ACABAMENTO, KIT BÁSICO e qualquer "kit" — são pacotes adicionais, NÃO são imóveis
4. Para tabelas com valores por andar (ex: "1º andar R$856.781 ... 26º andar R$985.299"), agrupe por tipologia: valor_minimo=menor valor, valor_maximo=maior valor
5. valor_minimo e valor_maximo são números puros sem R$, sem pontos de milhar (ex: 503146)
6. Para tabelas de pagamento (ATO, parcelas, financiamento, juros), coloque um resumo em mais_detalhes
7. Se um campo não existe, use null — NÃO invente dados

Responda APENAS com JSON válido, sem markdown:
{"lancamentos": [...]}`

const SYSTEM_PROMPT_MULTI = `Você é um especialista em extração de dados de tabelas de vendas imobiliárias brasileiras.
A imagem é uma FAIXA (recorte horizontal) de uma página de um tabelão com VÁRIOS empreendimentos. Cada tabelão tem um layout próprio (retrato ou paisagem, número de colunas variável). Leia a tabela visualmente, respeitando o alinhamento das colunas, e extraia TODAS as linhas de dados visíveis nesta faixa.

Cada lançamento segue este schema:
${LANCAMENTO_SCHEMA}

Regras CRÍTICAS (genéricas — valem para qualquer formato de tabelão):
1. CÉLULAS MESCLADAS: as colunas à esquerda (região, bairro e/ou empreendimento) frequentemente usam células mescladas que cobrem várias linhas de dados. Cada linha herda esses valores da célula mesclada imediatamente acima/à esquerda. NÃO propague o nome de um empreendimento para linhas que pertencem a OUTRO empreendimento — o valor muda quando começa um novo bloco.
2. EXTRAIA TODOS os empreendimentos e TODAS as linhas de dados desta faixa — NÃO descarte nenhum bloco, mesmo que o layout seja incomum.
3. AGREGUE POR TIPOLOGIA: gere uma linha por (empreendimento + tipologia + metragem). Se houver VÁRIAS unidades da mesma tipologia/metragem (andares ou números de apartamento diferentes, com preços diferentes), CONSOLIDE numa só: valor_minimo = menor preço, valor_maximo = maior preço.
4. CAMPO unidades = QUANTIDADE de unidades daquela tipologia, somente se a tabela informar essa quantidade. Se a tabela lista unidades individuais (coluna "Unidade"/"Andar" com número do apartamento, ex: 112, 1009), NÃO use esse número como quantidade — deixe null.
5. Se esta FAIXA cortou o cabeçalho de região/empreendimento, descubra o bairro pelo ENDEREÇO da linha (a rua indica o bairro) ou pelo TEXTO NATIVO. NUNCA repita cegamente o valor da linha anterior se houver dúvida.
6. SEMPRE preencha empreendimento, bairro e data_entrega quando a informação existir.
7. NÃO use o nome da construtora como substituto para empreendimento.
8. valor_minimo e valor_maximo são números puros sem R$, sem pontos de milhar (ex: 1625000).
9. IGNORE cabeçalhos de coluna, rodapés, notas e texto explicativo — apenas linhas de dados de imóveis.
10. TEXTO NATIVO: você recebe o TEXTO NATIVO do PDF (nomes e valores EXATOS, mas referente ao DOCUMENTO INTEIRO, fora de ordem). REGRA ABSOLUTA: extraia EXCLUSIVAMENTE as linhas que aparecem VISUALMENTE NESTA FAIXA da imagem. O texto nativo serve APENAS como dicionário para escrever corretamente os NOMES e VALORES das linhas que você VÊ na imagem — NÃO adicione linhas que não estão visíveis nesta faixa. NUNCA invente um nome que não apareça no texto nativo.
11. CAMPO bairro: normalize como "Bairro, Cidade" (vírgula). Ex: "Vila da Saúde, São Paulo".
12. CAMPO empreendimento: nome limpo, sem sufixos espúrios ("*", "¹", notas de rodapé).

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
        content: `Nome do arquivo: "${filename}"\n\nTexto extraído do PDF:\n\n${texto.substring(0, 8000)}`,
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getScreenshot({ scale: 3, base64: true })

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

// SINGLE: poucas tipologias espalhadas em várias páginas → manda o PDF inteiro,
// o modelo vê tudo e consolida naturalmente (uma linha por tipologia).
export async function processarSingle(buffer: Buffer, analise: AnaliseIA): Promise<LancamentoAI[]> {
  const pdfBase64 = buffer.toString('base64')
  const contexto = `Construtora: ${analise.construtora}\nEmpreendimento: ${analise.empreendimentos_identificados[0] ?? 'identifique no PDF'}`
  const result = await _extrairDePdf(SYSTEM_PROMPT_SINGLE, pdfBase64, contexto)
  return deduplicar(result)
}

// MULTI: tabelas densas e hierárquicas → renderiza cada página em alta resolução,
// corta em faixas horizontais (tiling) e processa cada faixa. Tiling dá mais
// resolução por linha e reduz erros de associação. Envia também o texto nativo
// (nomes/valores exatos) para evitar alucinação.
export async function processarMulti(buffer: Buffer, analise: AnaliseIA, textoNativo = ''): Promise<LancamentoAI[]> {
  const paginas = await renderizarPaginas(buffer)
  const contexto = `Construtora principal: ${analise.construtora}`

  // Cada página vira N faixas; todas as faixas são processadas em paralelo.
  const faixasPorPagina = await Promise.all(paginas.map(png => cortarEmFaixas(png, 3)))
  const todasFaixas = faixasPorPagina.flat()

  const resultados = await Promise.all(
    todasFaixas.map(faixa => _extrairDeImagem(SYSTEM_PROMPT_MULTI, faixa, contexto, textoNativo))
  )

  return deduplicar(resultados.flat())
}

// Consolida por (empreendimento + tipologia + metragem): mescla entradas com a mesma
// chave em vez de descartar. Preserva a faixa de valores (valor_minimo/maximo) quando há
// várias unidades da mesma tipologia (ex: Danti) e remove duplicatas de overlap das faixas.
function deduplicar(lancamentos: LancamentoAI[]): LancamentoAI[] {
  // Normaliza texto: minúsculo, só letras/números (remove pipes, pontuação, espaços).
  const norm = (s: string | null | undefined) =>
    (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  // Normaliza metragem para os números principais (robusto a "Garden 167m²" vs "167m²").
  const normMetragem = (s: string | null | undefined) =>
    ((s ?? '').match(/\d+[.,]?\d*/g) ?? []).map(n => n.replace(',', '.')).join('-')

  const chave = (l: LancamentoAI) =>
    `${norm(l.empreendimento)}|${norm(l.tipologia)}|${normMetragem(l.metragem)}`

  const toNum = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const map = new Map<string, LancamentoAI>()
  for (const l of lancamentos) {
    const k = chave(l)
    const existing = map.get(k)
    if (!existing) {
      map.set(k, { ...l })
      continue
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
  contexto: string
): Promise<LancamentoAI[]> {
  try {
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
            { type: 'text', text: `${contexto}\n\nExtraia todas as tipologias deste empreendimento, uma por linha.` },
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 16000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return []

    const parsed = JSON.parse(content)
    return (parsed.lancamentos ?? []) as LancamentoAI[]
  } catch {
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
  try {
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    const blocoTexto = textoNativo
      ? `\n\nTEXTO NATIVO DO PDF (dicionário do DOCUMENTO INTEIRO — nomes e valores EXATOS, fora de ordem). Use-o APENAS para escrever corretamente os nomes/valores das linhas que você VÊ nesta faixa; NÃO adicione linhas que não estão visíveis na imagem; NUNCA invente nomes:\n${textoNativo.substring(0, 22000)}`
      : ''

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
    if (!content) return []

    const parsed = JSON.parse(content)
    return (parsed.lancamentos ?? []) as LancamentoAI[]
  } catch {
    return []
  }
}
