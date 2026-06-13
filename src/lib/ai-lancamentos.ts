import sharp from 'sharp'
import { openai, AI_MODEL_ANALYZER, AI_MODEL_EXTRACTOR } from './openai'
import { createPDFParser } from './pdf-parse-server'
import type { AnaliseIA, LancamentoAI } from './types'
import { normalizarLancamentos } from './formatar-lancamento'
import { lerConcorrenciaFaixas } from './extracao-concorrencia'

const AI_TEMPERATURE = 0
const MAX_TENTATIVAS_EXTRACAO = 3
/** Faixas vazias acima desta fração → erro (evita resultado incompleto silencioso). */
const MAX_FAIXAS_VAZIAS_RATIO = 0.15

function numFaixasPorDocumento(totalPaginas: number, empreendimentosHint: number): number {
  if (totalPaginas >= 15 || empreendimentosHint >= 45) return 5
  if (totalPaginas >= 8 || empreendimentosHint >= 30) return 4
  return 3
}

async function extrairFaixasComCobertura<T>(
  items: T[],
  extractFn: (item: T, index: number) => Promise<LancamentoAI[]>
): Promise<LancamentoAI[]> {
  if (items.length === 0) return []

  const results: LancamentoAI[][] = new Array(items.length)

  await mapWithConcurrency(items, lerConcorrenciaFaixas(), async (item, i) => {
    results[i] = await extractFn(item, i)
  })

  const indicesVazios = results
    .map((r, i) => (r.length === 0 ? i : -1))
    .filter(i => i >= 0)

  for (const i of indicesVazios) {
    results[i] = await extractFn(items[i], i)
  }

  const aindaVazios = indicesVazios.filter(i => results[i].length === 0)
  if (aindaVazios.length > 0 && aindaVazios.length / items.length > MAX_FAIXAS_VAZIAS_RATIO) {
    throw new Error(
      `Extração incompleta: ${aindaVazios.length} de ${items.length} faixas sem dados. Use "Processar com IA" novamente nesta tela.`
    )
  }

  return results.flat()
}

const LANCAMENTO_SCHEMA = `{
  "construtora": "nome da construtora",
  "empreendimento": "nome do empreendimento",
  "endereco": "logradouro e número ou null",
  "bairro": "bairro ou null",
  "data_entrega": "ex: Maio/2029, 12/2028, Pronto ou null",
  "metragem": "ex: 64,21m², 98,00m², 47,00-64,00m² — sempre vírgula decimal e sufixo m²",
  "tipologia": "ex: Studio, 1 dorm, 2 dorms, 2 suítes, 3 suítes Duplex, 4 suítes, Garden, Penthouse, Loft, NR — Duplex/Garden/Penthouse são parte da tipologia",
  "unidade": "ex: 72-T2, 112, 241, Ap. 501 ou null — APENAS código/número do apartamento, SEM Duplex/Garden/Penthouse (isso vai em tipologia)",
  "andar": "ex: 3º andar, 12º andar, Térreo, Cobertura, 1º-26º — use sempre 'Nº andar' (não só 'Nº')",
  "vagas": "ex: 0, 0-1, 2, 4 ou null",
  "valor_minimo": número sem R$ sem pontos de milhar (ex: 503146) ou null,
  "valor_maximo": número ou null (null se igual ao mínimo),
  "desconto_margem": "ex: 10%, 3% a 22% ou null",
  "mais_detalhes": objeto JSON livre com informações extras ou null
}`

const REGRA_TIPOLOGIA_UNIDADE = `TIPOLOGIA vs UNIDADE: Duplex, Garden, Penthouse, Cobertura, Triplex são modificadores de TIPOLOGIA (ex: "3 suítes Duplex") — NUNCA em unidade. Unidade = apenas número/código do apartamento (ex: "241", "1009", "72-T2" — não "241 Duplex").`

const REGRA_TIPOLOGIA_TRUNCADA = `TIPOLOGIA TRUNCADA por coluna estreita/corte de faixa: COMPLETE padrões padronizados do mercado usando TEXTO NATIVO ou dedução óbvia — ex: "2 dorms. (1 suí" → "2 dorms (1 suíte)", "3 suít" → "3 suítes", "Dupl" → "Duplex". Isso é dedução de padrão recorrente em tabelões, não invenção. NÃO complete variantes específicas (FINAL 1, metragem, nome de planta) sem evidência no PDF.`

const REGRA_CONSISTENCIA_COLUNAS = `CONSISTÊNCIA DE COLUNAS NO BLOCO TABULAR:
- Cada bloco de tabela tem cabeçalhos de coluna (UNIDADES, METRAGEM, TIPO/TIPOLOGIA, PREÇO/DE/POR, ANDAR, VAGAS, ENDEREÇO, STATUS/ENTREGA, etc.). Se a coluna EXISTE no cabeçalho, TODAS as linhas de dados daquele bloco têm célula nessa coluna — preencha o campo correspondente em CADA linha JSON.
- Nunca deixe unidade, metragem, tipologia ou preço preenchidos em algumas linhas do bloco e vazios em outras quando a coluna está presente. Leia linha a linha, coluna a coluna.
- Célula vazia ou traço "—" no PDF → null no JSON. Isso é raro; não omita a linha inteira.
- Células mescladas verticalmente (ENDEREÇO, STATUS, ENTREGA): o valor vale para TODAS as linhas do bloco — repita em cada linha JSON.
- Mapeamento comum: UNIDADES/Unidade/Apto/Ap. → unidade (número do apto); METRAGEM/Área/m² privativa → metragem; TIPO/TIPOLOGIA → tipologia; POR/Preço/Valor de venda → valor_minimo; DE/Valor tabela → valor_maximo quando houver desconto; STATUS/Entrega → data_entrega; ENDEREÇO → endereco.
- Tabela com coluna de apartamentos individuais (404, 406, 501…): UMA linha JSON por linha da tabela — NÃO agregue por tipologia. Preencha unidade em todas as linhas.`

const REGRA_SOMENTE_TABELAS = `SOMENTE BLOCOS TABULARES — ignore plantas e mapas coloridos:
- Extraia APENAS de blocos com estrutura de TABELA: linha de cabeçalho de colunas alinhadas (ex.: Empreendimento, Unidade, Dorm./Tipologia, Vagas, Metragem/Área, Preço/Valor Total, Situação/Status, Entrega…) seguida de linhas de dados em colunas.
- IGNORE completamente e NÃO produza linhas JSON a partir de: plantas baixas, mapas de disponibilidade, grades de unidades coloridas (vermelho/verde/outras cores), blocos só com número de apto + m² sem cabeçalho tabular de preço/dados, fachadas, legendas visuais e diagramas de pavimento.
- Células coloridas de disponibilidade NÃO são tabela de vendas — mesmo listando unidades. A fonte correta é a tabela tabular com cabeçalho (ex.: UNIDADE | ÁREA PRIVATIVA | GARAGEM | SITUAÇÃO | VALOR TOTAL).
- TEXTO NATIVO: não crie linhas a partir de unidades que aparecem só em plantas/mapas; use-o apenas para COMPLETAR campos de linhas já visíveis em tabelas tabulares válidas.`

const REGRA_COMPLETUDE = `COMPLETUDE vs INVENÇÃO (prioridade máxima):
- ${REGRA_SOMENTE_TABELAS}
- Analise a tabela com MUITO cuidado: estrutura visual, alinhamento de colunas, células mescladas, blocos por empreendimento e tabelas largas com preço à direita.
- Para CADA linha de dados em bloco tabular VÁLIDO visível, produza UMA linha JSON — mesmo parcial, incompleta ou ambígua.
- NUNCA omita linhas por incerteza ou dados faltando. Na dúvida, INCLUA a linha e deixe os campos ausentes como null.
- Campo realmente ausente no documento → null. Vagas = "0" somente quando a tabela indicar zero vagas.
- NUNCA invente: não chute empreendimento, bairro, preço, unidade ou andar que não constem no PDF/texto nativo para aquela linha.
- TEXTO NATIVO completa campos de linhas JÁ visíveis (ex: preço cortado na faixa). Não crie linhas que não aparecem na imagem desta faixa.
- ${REGRA_CONSISTENCIA_COLUNAS}
- ${REGRA_TIPOLOGIA_TRUNCADA}`

const SYSTEM_PROMPT_SINGLE = `Você é um especialista em extração de dados de tabelas de vendas imobiliárias brasileiras.
Você está VENDO o PDF completo de UM empreendimento. Extraia TODAS as linhas de imóvel: uma linha JSON por unidade quando houver coluna UNIDADES/Apto, ou uma linha por tipologia/variante em tabelas agregadas — consolidando dados de todas as páginas.

Cada lançamento segue este schema:
${LANCAMENTO_SCHEMA}

Regras críticas:
0. ${REGRA_COMPLETUDE}
1. Tabela com coluna UNIDADES/Apto/Unidade listando apartamentos (404, 406, 501…): UMA linha JSON por linha da tabela — preencha unidade, metragem, tipologia e preço em TODAS as linhas. Tabelas agregadas por tipologia ou preço por andar (sem número de apto): UMA linha por tipologia ou variante (Studio, 1 dorm, 2 dorms FINAL 2, etc.). Variantes distintas = linhas separadas.
2. NÃO ignore tipologias com suítes — "2 SUÍTES", "3 SUÍTES" são tão válidas quanto "2 dorms"
3. IGNORE completamente: KIT CONFORTO, KIT AUTOMAÇÃO, KIT DE ACABAMENTO, KIT BÁSICO e qualquer "kit" — são pacotes adicionais, NÃO são imóveis
4. Páginas com tabelas UNIDADES + PREÇO DE VENDA por andar (mesmo com colunas ATO/MENSAIS/FINANCIAMENTO) contêm dados de imóvel — extraia TODAS as tipologias de TODAS as páginas, inclusive páginas 9 em diante.
5. Para tabelas com valores por andar (ex: "1º andar R$856.781 ... 26º andar R$985.299"), agrupe por variante: valor_minimo=menor PREÇO DE VENDA, valor_maximo=maior, andar=faixa "1º-26º"
6. valor_minimo e valor_maximo são números puros sem R$, sem pontos de milhar (ex: 503146). SEMPRE preencha quando o PDF informar — colunas comuns: "Valor Total", "Preço", "Preço de Venda", "R$".
7. Tabelas largas (ex: Lindenberg): tipologia/metragem à esquerda e preço à direita. Se esta faixa mostrar a linha mas não a coluna de preço, busque o valor no TEXTO NATIVO para a mesma tipologia + metragem + unidade/andar.
8. CAMPO unidade: colunas Unidade/Apto/Ap./Apartamento — só o número/código (241, 1009). Coluna UNIDADES com "1º andar" → use andar, não unidade.
9. ${REGRA_TIPOLOGIA_UNIDADE}
10. CAMPO andar: pavimento/nível (3º, 12º andar, Térreo, 1º-26º).
11. CÉLULAS MESCLADAS (entrega): quando entrega aparecer em célula mesclada, repita data_entrega em TODAS as linhas do bloco.
12. Para tabelas de pagamento (ATO, parcelas, financiamento, juros), coloque um resumo em mais_detalhes
13. TEXTO NATIVO: nomes, valores, entrega, unidade e andar EXATOS. Use para preencher campos faltantes de linhas visíveis.
14. Linha visível sem preço na imagem mas com preço no texto nativo → preencha valor_minimo/valor_maximo. Linha visível sem preço em lugar nenhum → inclua a linha com valor_minimo null.
15. Revise a tabela inteira antes de responder — confira se não pulou nenhuma linha de imóvel no fim, no meio ou em blocos pequenos.

Responda APENAS com JSON válido, sem markdown:
{"lancamentos": [...]}`

const SYSTEM_PROMPT_SINGLE_FAIXA = `Você é um especialista em extração de dados de tabelas de vendas imobiliárias brasileiras.
A imagem é uma FAIXA (recorte horizontal) de uma página de um PDF de UM ÚNICO empreendimento. Leia a tabela visualmente e extraia TODOS os blocos de tipologia visíveis nesta faixa.

Cada lançamento segue este schema:
${LANCAMENTO_SCHEMA}

Regras CRÍTICAS:
0. ${REGRA_COMPLETUDE}
1. Extraia TODOS os blocos tabulares válidos visíveis nesta faixa — NÃO pare no primeiro. NÃO extraia de plantas ou mapas coloridos. Tabela com coluna UNIDADES/Apto: UMA linha JSON por linha — preencha unidade, metragem, tipologia e preço em TODAS as linhas do bloco.
2. Tabelas com coluna UNIDADES (andares 1º–26º), ÁREA PRIVATIVA, PREÇO DE VENDA e colunas de pagamento (ATO, MENSAIS, FINANCIAMENTO) são tabelas de PREÇO DE UNIDADES — NÃO descarte por parecer "só pagamento". O PREÇO DE VENDA de cada andar é o valor do imóvel.
3. Variantes distintas (ex: "2 DORM - FINAL 1" vs "2 DORM - FINAL 2", metragens diferentes) = LINHAS SEPARADAS. Inclua o sufixo completo na tipologia (ex: "2 dorms FINAL 2").
4. Bloco com preços por andar: UMA linha por variante — valor_minimo = menor PREÇO DE VENDA da coluna, valor_maximo = maior, andar = faixa "1º-26º" (ou intervalo visível), metragem da coluna ÁREA PRIVATIVA, vagas da coluna VAGAS.
5. IGNORE KIT CONFORTO, KIT AUTOMAÇÃO, KIT DE ACABAMENTO e qualquer "kit" — não são imóveis.
6. CAMPO unidade: só número/código do apto (241, 1009, 72-T2). Coluna UNIDADES com "1º andar" → use andar.
7. ${REGRA_TIPOLOGIA_UNIDADE}
8. CAMPO andar: pavimento/nível (3º, 12º andar, 1º-26º). Não confunda com código de apartamento.
9. valor_minimo e valor_maximo: números puros sem R$, sem pontos de milhar. OBRIGATÓRIO quando o PDF informar preço da linha.
10. Tabelas largas (ex: Lindenberg): cada linha de tipologia/unidade tem preço em coluna à direita ("Valor Total", "Preço", "R$"). Se a coluna de preço não couber nesta faixa da imagem, localize o valor no TEXTO NATIVO pela mesma tipologia + metragem + unidade/andar.
11. Linha visível com tipologia/metragem: busque preço no texto nativo se a coluna estiver cortada. Se não houver preço em lugar nenhum, inclua a linha com valor_minimo null.
12. CÉLULAS MESCLADAS: data_entrega (ex: Junho/2026) em célula mesclada vale para TODAS as linhas do mesmo bloco — repita em cada linha JSON do bloco.
13. CAMPO andar: preencha quando houver coluna de andar/pavimento; use TEXTO NATIVO se a coluna estiver fora da faixa.
14. Resumo de parcelas/condições de pagamento → mais_detalhes (não crie linha extra por parcela).
15. Antes de responder, varra a faixa de cima a baixo e confira se extraiu TODAS as linhas de imóvel — inclusive blocos pequenos no meio/fim.

Responda APENAS com JSON válido, sem markdown:
{"lancamentos": [...]}`

const SYSTEM_PROMPT_MULTI = `Você é um especialista em extração de dados de tabelas de vendas imobiliárias brasileiras.
A imagem é uma FAIXA (recorte horizontal) de uma página de um tabelão com VÁRIOS empreendimentos. Cada tabelão tem um layout próprio (retrato ou paisagem, número de colunas variável). Leia a tabela visualmente, respeitando o alinhamento das colunas, e extraia TODAS as linhas de dados visíveis nesta faixa.

Cada lançamento segue este schema:
${LANCAMENTO_SCHEMA}

Regras CRÍTICAS (genéricas — valem para qualquer formato de tabelão):
0. ${REGRA_COMPLETUDE}
1. CÉLULAS MESCLADAS: região/bairro/empreendimento à esquerda usam células mescladas. Cada LINHA DE DADOS herda o empreendimento e o bairro do bloco ao qual pertence visualmente — NÃO do bloco vizinho acima.
2. BAIRRO vs EMPREENDIMENTO: o bairro de cada linha é o da MESMA linha/bloco do empreendimento. Se o cabeçalho mesclado diz "Campo Belo" mas a linha é "Aura Moema", o bairro correto é Moema (o nome do empreendimento indica o bairro). NUNCA atribua "Campo Belo" a empreendimentos de outro bairro só por proximidade na tabela.
3. EXTRAIA TODOS os empreendimentos e TODAS as linhas de dados tabulares válidos desta faixa — NÃO descarte tabelas com cabeçalho de colunas, mesmo que o layout seja incomum. Blocos pequenos no meio ou no fim da faixa também contam — não pare após o primeiro empreendimento. NÃO extraia de plantas/mapas coloridos (ver regra de blocos tabulares).
4. Se o bloco tem coluna UNIDADES/Apto com números individuais: UMA linha JSON por linha — preencha unidade em todas; NÃO agregue. Agregue por tipologia SOMENTE quando NÃO houver coluna de apartamentos individuais e várias linhas forem claramente o MESMO empreendimento com a MESMA tipologia (ex.: preços por andar). Se cada linha é empreendimento ou unidade distinta, produza UMA linha JSON por linha visível.
5. CAMPO unidade: só número/código do apto (ex: 72-T2, 112, 241). Quando a coluna UNIDADES existir no bloco, TODAS as linhas devem ter unidade preenchida.
6. ${REGRA_TIPOLOGIA_UNIDADE}
7. CAMPO andar: APENAS pavimento/nível (ex: 3º, 12º andar, Térreo, Cobertura). Faixa → "1º-26º". Não coloque código de unidade/apartamento aqui.
8. Se esta FAIXA cortou o cabeçalho de região/empreendimento, descubra o bairro pelo NOME DO EMPREENDIMENTO, pelo ENDEREÇO da linha ou pelo TEXTO NATIVO — NUNCA repita cegamente o bairro da célula mesclada acima se o empreendimento indicar outro bairro.
9. SEMPRE preencha empreendimento, bairro e data_entrega quando a informação existir.
10. NÃO use o nome da construtora como substituto para empreendimento.
11. valor_minimo e valor_maximo são números puros sem R$, sem pontos de milhar (ex: 1625000). SEMPRE preencha quando a linha tiver preço — colunas "Valor Total", "Preço", "Preço de Venda", "R$".
12. Tabelas largas: se a faixa mostrar tipologia/metragem mas a coluna de preço estiver cortada, use o TEXTO NATIVO para preencher valor_minimo/valor_maximo daquela linha.
13. IGNORE cabeçalhos de coluna, rodapés, notas e texto explicativo — apenas linhas de dados de imóveis.
14. Linha visível sem preço na imagem: busque no texto nativo. Se não existir em lugar nenhum, inclua a linha com valor_minimo null — não omita.
15. CAMPO bairro: normalize como "Bairro, Cidade" (vírgula). Ex: "Vila da Saúde, São Paulo". Confira coerência com o nome do empreendimento.
16. CAMPO empreendimento: nome limpo, sem sufixos espúrios ("*", "¹", notas de rodapé).
17. Antes de responder, varra a faixa inteira e confira se extraiu TODAS as linhas de imóvel visíveis — inclusive empreendimentos pequenos no meio/fim da tabela.

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
    temperature: AI_TEMPERATURE,
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
    return normalizarLancamentos(deduplicar(result), textoNativo)
  }

  const totalPaginas = paginas.length
  const numFaixas = numFaixasPorDocumento(totalPaginas, analise.empreendimentos_identificados?.length ?? 0)

  type FaixaJob = { png: Buffer; pagina: number }
  const faixasPorPagina = await Promise.all(
    paginas.map(async (png, i) => {
      const faixas = await cortarEmFaixas(png, numFaixas)
      return faixas.map(f => ({ png: f, pagina: i + 1 }))
    })
  )
  const jobs: FaixaJob[] = faixasPorPagina.flat()

  const bruto = await extrairFaixasComCobertura(jobs, async ({ png, pagina }) => {
    const contexto = `${contextoBase}\nPágina ${pagina} de ${totalPaginas}. Extraia todos os blocos de tipologia visíveis nesta faixa — inclusive tabelas de PREÇO DE VENDA por andar.`
    return _extrairDeImagem(SYSTEM_PROMPT_SINGLE_FAIXA, png, contexto, textoNativo)
  })

  return normalizarLancamentos(deduplicar(bruto), textoNativo)
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

  const totalPaginas = paginas.length
  const numFaixas = numFaixasPorDocumento(totalPaginas, analise.empreendimentos_identificados?.length ?? 0)

  const faixasPorPagina = await Promise.all(paginas.map(png => cortarEmFaixas(png, numFaixas)))
  const todasFaixas = faixasPorPagina.flat()

  const bruto = await extrairFaixasComCobertura(todasFaixas, faixa =>
    _extrairDeImagem(SYSTEM_PROMPT_MULTI, faixa, contexto, textoNativo)
  )

  return normalizarLancamentos(deduplicar(bruto), textoNativo)
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

const SUFIXOS_TIPOLOGIA = ['duplex', 'triplex', 'garden', 'penthouse', 'cobertura', 'sobreloja'] as const

function appendTipologia(l: LancamentoAI, extra: string) {
  const extraNorm = extra.trim()
  if (!extraNorm) return
  const tip = (l.tipologia ?? '').trim()
  if (tip.toLowerCase().includes(extraNorm.toLowerCase())) return
  l.tipologia = tip ? `${tip} ${extraNorm}` : extraNorm
}

function capitalizarModificador(s: string) {
  const lower = s.toLowerCase()
  if (lower === 'duplex') return 'Duplex'
  if (lower === 'triplex') return 'Triplex'
  if (lower === 'penthouse') return 'Penthouse'
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// Move Duplex/Garden/etc. de unidade para tipologia (ex: "241 Duplex" → unidade "241", tipologia "+ Duplex").
function normalizarTipologiaUnidade(lancamentos: LancamentoAI[]): LancamentoAI[] {
  for (const l of lancamentos) {
    const u = l.unidade?.trim()
    if (!u) continue

    const uLower = u.toLowerCase()

    if (SUFIXOS_TIPOLOGIA.some(s => uLower === s)) {
      l.unidade = null
      appendTipologia(l, capitalizarModificador(uLower))
      continue
    }

    const match = u.match(/^([\d]+[\w-]*)\s+(.+)$/i)
    if (!match) continue

    const codigo = match[1]
    const sufixo = match[2].trim()
    const sufixoLower = sufixo.toLowerCase()

    const mods = SUFIXOS_TIPOLOGIA.filter(s => sufixoLower.includes(s))
    if (mods.length === 0) continue

    l.unidade = codigo
    for (const mod of mods) {
      appendTipologia(l, capitalizarModificador(mod))
    }
  }
  return lancamentos
}

const normTxt = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

function campoPreenchido(v: unknown): boolean {
  return v != null && v !== ''
}

function chaveBlocoTabular(l: LancamentoAI): string | null {
  const end = normTxt(l.endereco)
  const emp = normTxt(l.empreendimento)
  const con = normTxt(l.construtora)
  if (end.length >= 8) return `${con}|${emp}|e:${end.slice(0, 48)}`
  if (emp.length >= 3) return `${con}|emp:${emp}`
  return null
}

function valorDominanteNoBloco(grupo: LancamentoAI[], campo: keyof LancamentoAI): unknown {
  const freq = new Map<string, { count: number; value: unknown }>()
  for (const l of grupo) {
    const v = l[campo]
    if (!campoPreenchido(v)) continue
    const k = typeof v === 'object' ? JSON.stringify(v) : String(v).trim()
    const entry = freq.get(k) ?? { count: 0, value: v }
    entry.count++
    freq.set(k, entry)
  }
  let best: { count: number; value: unknown } | null = null
  for (const entry of freq.values()) {
    if (!best || entry.count > best.count) best = entry
  }
  return best?.value ?? null
}

/** Propaga campos de colunas presentes no bloco (células mescladas + colunas com valor único). */
function completarColunasPorBloco(lancamentos: LancamentoAI[]): LancamentoAI[] {
  const items = lancamentos.map(l => ({ ...l }))
  const grupos = new Map<string, LancamentoAI[]>()

  for (const l of items) {
    const k = chaveBlocoTabular(l)
    if (!k) continue
    const arr = grupos.get(k) ?? []
    arr.push(l)
    grupos.set(k, arr)
  }

  const camposMesclados: (keyof LancamentoAI)[] = [
    'construtora', 'empreendimento', 'endereco', 'bairro', 'data_entrega',
  ]
  const camposCompartilhados: (keyof LancamentoAI)[] = [
    'tipologia', 'vagas', 'desconto_margem', 'valor_minimo', 'valor_maximo',
  ]

  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue

    for (const campo of camposMesclados) {
      const best = valorDominanteNoBloco(grupo, campo)
      if (!campoPreenchido(best)) continue
      for (const l of grupo) {
        if (!campoPreenchido(l[campo])) {
          ;(l as Record<string, unknown>)[campo] = best
        }
      }
    }

    for (const campo of camposCompartilhados) {
      const preenchidos = grupo.filter(l => campoPreenchido(l[campo]))
      if (preenchidos.length === 0) continue
      const dominante = valorDominanteNoBloco(grupo, campo)
      if (!campoPreenchido(dominante)) continue
      const distintos = new Set(
        preenchidos.map(l => {
          const v = l[campo]
          return typeof v === 'object' ? JSON.stringify(v) : String(v).trim()
        })
      )
      if (distintos.size !== 1) continue
      for (const l of grupo) {
        if (!campoPreenchido(l[campo])) {
          ;(l as Record<string, unknown>)[campo] = dominante
        }
      }
    }
  }

  return items
}

// Consolida por (empreendimento + tipologia + metragem): mescla entradas com a mesma
// chave em vez de descartar. Preserva a faixa de valores (valor_minimo/maximo) quando há
// várias linhas da mesma tipologia (ex: Danti) e remove duplicatas de overlap das faixas.
function deduplicar(lancamentos: LancamentoAI[]): LancamentoAI[] {
  const entrada = normalizarTipologiaUnidade(lancamentos.map(l => ({ ...l })))
  const norm = normTxt
  const normMetragem = (s: string | null | undefined) =>
    ((s ?? '').match(/\d+[.,]?\d*/g) ?? []).map(n => n.replace(',', '.')).join('-')

  const toNum = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const tokenBairro = (bairro: string | null | undefined) =>
    norm((bairro ?? '').split(',')[0])

  const scoreBairro = (empreendimento: string, bairro: string | null | undefined) => {
    const emp = norm(empreendimento)
    const b = tokenBairro(bairro)
    if (!emp || !b || b.length < 3) return 0
    if (emp.includes(b)) return 2
    return 1
  }

  const escolherBairro = (empreendimento: string, a: string | null, b: string | null) => {
    const sa = scoreBairro(empreendimento, a)
    const sb = scoreBairro(empreendimento, b)
    if (sa > sb) return a
    if (sb > sa) return b
    if ((a?.length ?? 0) >= (b?.length ?? 0)) return a ?? b
    return b ?? a
  }

  const precosSimilares = (a: number | null, b: number | null, tol = 0.03) => {
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    const base = Math.max(a, b, 1)
    return Math.abs(a - b) / base <= tol
  }

  const chave = (l: LancamentoAI) => {
    const emp = norm(l.empreendimento)
    const tip = norm(l.tipologia)
    const met = normMetragem(l.metragem)
    const unidade = norm(l.unidade)
    const andar = norm(l.andar)
    const val = toNum(l.valor_minimo)
    // Sem empreendimento: mantém bairro/endereço para desambiguar.
    if (!emp) {
      return `|${norm(l.bairro)}|${norm(l.endereco).slice(0, 24)}|${tip}|${met}|${unidade}|${andar}|${val ?? ''}`
    }
    // Com empreendimento + unidade: uma linha por apto (overlap de faixas traz campos parciais).
    if (unidade) return `${emp}|u:${unidade}`
    if (andar) return `${emp}|${tip}|${met}|a:${andar}|${val ?? ''}`
    return `${emp}|${tip}|${met}|${val ?? ''}`
  }

  const mesclarCampos = (dest: LancamentoAI, src: LancamentoAI) => {
    const scoreDestAntes = scoreBairro(dest.empreendimento, dest.bairro)
    const scoreSrcAntes = scoreBairro(dest.empreendimento, src.bairro)
    dest.bairro = escolherBairro(dest.empreendimento, dest.bairro, src.bairro)

    const mins = [toNum(dest.valor_minimo), toNum(src.valor_minimo)].filter((n): n is number => n != null)
    const maxs = [toNum(dest.valor_maximo), toNum(src.valor_maximo), ...mins].filter((n): n is number => n != null)
    if (mins.length) dest.valor_minimo = Math.min(...mins)
    if (maxs.length) dest.valor_maximo = Math.max(...maxs)
    else if (mins.length && dest.valor_maximo == null) dest.valor_maximo = dest.valor_minimo

    for (const [campo, valor] of Object.entries(src) as [keyof LancamentoAI, unknown][]) {
      if (campo === 'valor_minimo' || campo === 'valor_maximo' || campo === 'bairro') continue
      if ((campo === 'unidade' || campo === 'andar') && scoreSrcAntes < scoreDestAntes) continue
      const atual = dest[campo]
      if ((atual == null || atual === '') && valor != null && valor !== '') {
        ;(dest as Record<string, unknown>)[campo] = valor
      }
    }
  }

  const map = new Map<string, LancamentoAI>()
  for (const l of entrada) {
    const k = chave(l)
    const existing = map.get(k)
    if (!existing) {
      map.set(k, { ...l })
      continue
    }

    const vExist = toNum(existing.valor_minimo)
    const vNovo = toNum(l.valor_minimo)
    if (vExist != null && vNovo != null && !precosSimilares(vExist, vNovo)) {
      map.set(`${k}|${vNovo}`, { ...l })
      continue
    }

    mesclarCampos(existing, l)
  }

  // Segunda passagem: funde linhas do mesmo empreendimento+tipologia+metragem com preços iguais
  // mas chaves diferentes (ex: unidade "32" vs vazio, bairros conflitantes por overlap de faixa).
  const fundirSemelhantes = (items: LancamentoAI[]): LancamentoAI[] => {
    const grupos = new Map<string, LancamentoAI[]>()
    let semEmpIdx = 0
    for (const l of items) {
      const emp = norm(l.empreendimento)
      if (!emp) {
        grupos.set(`__sem_emp__${semEmpIdx++}`, [l])
        continue
      }
      const gk = `${emp}|${norm(l.tipologia)}|${normMetragem(l.metragem)}`
      const arr = grupos.get(gk) ?? []
      arr.push(l)
      grupos.set(gk, arr)
    }

    const resultado: LancamentoAI[] = []
    for (const grupo of grupos.values()) {
      if (grupo.length === 1) {
        resultado.push(grupo[0])
        continue
      }

      const usados = new Set<number>()
      for (let i = 0; i < grupo.length; i++) {
        if (usados.has(i)) continue
        const base = { ...grupo[i] }
        usados.add(i)

        for (let j = i + 1; j < grupo.length; j++) {
          if (usados.has(j)) continue
          const outro = grupo[j]

          const unidadeBase = norm(base.unidade)
          const unidadeOutro = norm(outro.unidade)
          if (unidadeBase && unidadeOutro && unidadeBase === unidadeOutro) {
            mesclarCampos(base, outro)
            usados.add(j)
            continue
          }

          if (!precosSimilares(toNum(base.valor_minimo), toNum(outro.valor_minimo))) continue

          // Apartamentos distintos no mesmo bloco — nunca colapsar (ex.: unidades 404 e 406).
          if (base.unidade?.trim() && outro.unidade?.trim() && norm(base.unidade) !== norm(outro.unidade)) {
            continue
          }
          if (!base.unidade?.trim() && !outro.unidade?.trim()) {
            const metB = normMetragem(base.metragem)
            const metO = normMetragem(outro.metragem)
            if (metB && metO && metB !== metO) continue
          }

          // Mesmo imóvel com bairro errado herdado de célula mesclada vizinha.
          const bairrosDiferentes = norm(base.bairro) !== norm(outro.bairro)
          const unidadesCompativeis =
            !base.unidade || !outro.unidade || norm(base.unidade) === norm(outro.unidade)
          const andaresCompativeis =
            !base.andar || !outro.andar || norm(base.andar) === norm(outro.andar)

          if (bairrosDiferentes || (unidadesCompativeis && andaresCompativeis)) {
            mesclarCampos(base, outro)
            usados.add(j)
          }
        }

        resultado.push(base)
      }
    }
    return resultado
  }

  // Propaga data_entrega e normaliza bairro dentro do mesmo empreendimento (célula mesclada no PDF).
  const propagarCamposEmpreendimento = (items: LancamentoAI[]): LancamentoAI[] => {
    const porEmp = new Map<string, LancamentoAI[]>()
    for (const l of items) {
      const k = norm(l.empreendimento)
      if (!k) continue
      const arr = porEmp.get(k) ?? []
      arr.push(l)
      porEmp.set(k, arr)
    }

    for (const grupo of porEmp.values()) {
      const entrega = grupo.find(l => l.data_entrega?.trim())?.data_entrega ?? null
      let melhorBairro: string | null = null
      for (const l of grupo) {
        melhorBairro = escolherBairro(l.empreendimento, melhorBairro, l.bairro)
      }
      for (const l of grupo) {
        if (!l.data_entrega?.trim() && entrega) l.data_entrega = entrega
        if (melhorBairro) l.bairro = escolherBairro(l.empreendimento, l.bairro, melhorBairro)
      }
    }
    return items
  }

  return completarColunasPorBloco(
    propagarCamposEmpreendimento(fundirSemelhantes(Array.from(map.values())))
  )
}

// Extração a partir do PDF inteiro (visão nativa) — usado no fluxo single
async function _extrairDePdf(
  systemPrompt: string,
  pdfBase64: string,
  contexto: string,
  textoNativo = ''
): Promise<LancamentoAI[]> {
  const blocoTexto = textoNativo
    ? `\n\nTEXTO NATIVO DO PDF (referência do DOCUMENTO INTEIRO — nomes e valores EXATOS). Use para completar campos de linhas visíveis em todas as páginas. Não omita linhas por falta de dado — use null:\n${textoNativo.substring(0, 40000)}`
    : ''

  for (let attempt = 0; attempt < MAX_TENTATIVAS_EXTRACAO; attempt++) {
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
              { type: 'text', text: `${contexto}\n\nAnalise o PDF com cuidado. Extraia linhas SOMENTE de tabelas tabulares com cabeçalho de colunas (Unidade, Metragem, Preço, etc.) — ignore plantas e mapas coloridos. Uma linha JSON por linha de tabela válida. Se o bloco tem coluna UNIDADES/METRAGEM/TIPO/PREÇO, preencha em TODAS as linhas (célula vazia = null).${blocoTexto}` },
            ],
          },
        ],
        temperature: AI_TEMPERATURE,
        response_format: { type: 'json_object' },
        max_tokens: 16000,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) continue

      if (completion.choices[0]?.finish_reason === 'length') {
        console.error('[extrairDePdf] resposta truncada (max_tokens) — tipologias podem ter sido omitidas')
        if (attempt < MAX_TENTATIVAS_EXTRACAO - 1) continue
      }

      const parsed = JSON.parse(content)
      const lancamentos = (parsed.lancamentos ?? []) as LancamentoAI[]
      if (lancamentos.length === 0 && attempt < MAX_TENTATIVAS_EXTRACAO - 1) continue
      return lancamentos
    } catch (err) {
      if (attempt === MAX_TENTATIVAS_EXTRACAO - 1) {
        console.error('[extrairDePdf] falha na extração:', err)
      }
    }
  }

  return []
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
    ? `\n\nTEXTO NATIVO DO PDF (dicionário do DOCUMENTO INTEIRO — nomes e valores EXATOS, fora de ordem). Use para COMPLETAR campos das linhas VISÍVEIS nesta faixa (preço, entrega, unidade, andar cortados na imagem). Não omita linhas visíveis por falta de dado — use null. Não adicione linhas que não aparecem nesta faixa:\n${textoNativo.substring(0, 40000)}`
    : ''

  for (let attempt = 0; attempt < MAX_TENTATIVAS_EXTRACAO; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: AI_MODEL_EXTRACTOR,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              { type: 'text', text: `${contexto}\n\nEsta imagem é uma FAIXA (recorte horizontal) de uma página. Extraia linhas SOMENTE de tabelas tabulares com cabeçalho de colunas — ignore plantas e mapas coloridos (vermelho/verde). Uma linha JSON por linha de tabela válida visível nesta faixa. Preencha colunas presentes em todas as linhas do bloco (célula vazia = null). Não adicione linhas de fora da faixa nem de plantas.${blocoTexto}` },
            ],
          },
        ],
        temperature: AI_TEMPERATURE,
        response_format: { type: 'json_object' },
        max_tokens: 16000,
      })

      const content = completion.choices[0]?.message?.content
      if (!content) continue

      if (completion.choices[0]?.finish_reason === 'length') {
        console.error('[extrairDeImagem] resposta truncada (max_tokens) — faixa pode ter linhas omitidas')
        if (attempt < MAX_TENTATIVAS_EXTRACAO - 1) continue
      }

      const parsed = JSON.parse(content)
      const lancamentos = (parsed.lancamentos ?? []) as LancamentoAI[]
      if (lancamentos.length === 0 && attempt < MAX_TENTATIVAS_EXTRACAO - 1) continue
      return lancamentos
    } catch (err) {
      if (attempt === MAX_TENTATIVAS_EXTRACAO - 1) {
        console.error('[extrairDeImagem] falha na faixa após retries:', err)
      }
    }
  }

  return []
}
