# 🔒 PIPELINE DE EXTRAÇÃO DE LANÇAMENTOS — DOCUMENTO IMUTÁVEL

> **STATUS: CONGELADO / IMMUTABLE — NÃO ALTERAR.**
>
> Este documento descreve o pipeline de extração de PDFs de tabelões imobiliários
> que está **funcionando e validado**. Ele é a fonte de verdade para qualquer
> trabalho futuro. **Nenhum arquivo, função, parâmetro ou prompt descrito aqui
> deve ser modificado** ao desenvolver novas funcionalidades. Novas features
> devem ser construídas **ao redor** deste fluxo, nunca dentro dele.
>
> Se uma evolução futura *exigir* tocar neste pipeline, isso é uma decisão
> explícita do dono do projeto — pare, documente o motivo e atualize a versão
> deste arquivo de forma deliberada. Caso contrário: **não mexa.**
>
> Última validação: extração correta de Cyrela (multi), Tibério (multi) e
> Metropolitan (single) com nomes/valores exatos e sem alucinações.

---

## 1. Objetivo

Receber um PDF de tabela de vendas de construtora ("tabelão") e popular a tabela
`lancamentos` no Supabase, com **uma linha por tipologia por empreendimento**,
de forma íntegra e correta. O usuário revisa e confirma antes de salvar.

---

## 2. Arquivos que compõem o pipeline (NÃO ALTERAR)

| Arquivo | Papel |
|---------|-------|
| `src/lib/ai-lancamentos.ts` | **Coração do pipeline.** Classificação + extração via IA. |
| `src/lib/openai.ts` | Cliente OpenAI e nomes dos modelos. |
| `src/lib/types.ts` | Tipos `Lancamento`, `ProcessamentoLancamento`, `AnaliseIA`, `LancamentoAI`. |
| `src/app/api/upload/route.ts` | Upload do PDF para o Storage + registro em `processamentos_lancamentos` + **bloqueio por `content_hash`** (v1.2). |
| `src/app/api/processar/route.ts` | Orquestra: extrai texto, classifica, extrai, salva resultado. |
| `src/app/api/confirmar/route.ts` | Persiste os lançamentos revisados em `lancamentos`. |

**Tabelas Supabase:** `lancamentos`, `processamentos_lancamentos`. **Bucket:** `pdfs`.

---

## 3. Modelos de IA (NÃO TROCAR)

Definidos em `src/lib/openai.ts`:

```
AI_MODEL_ANALYZER  = 'gpt-4o-mini'   // classificação (barato)
AI_MODEL_EXTRACTOR = 'gpt-4.1'       // extração (visão + precisão)
```

`gpt-4.1` foi escolhido após validação empírica: é capaz e custo-efetivo para
extração estruturada com visão. **Não é caso de fine-tuning.** O que garante
qualidade é a **engenharia de entrada** (resolução + tiling + texto nativo),
não o modelo.

---

## 4. Fluxo completo (passo a passo)

```
Upload do PDF
   │
   ▼
/api/processar
   │  1. baixa o PDF do Storage  →  buffer
   │  2. extrai TEXTO NATIVO com pdf-parse (PDFParse.getText)
   │  3. analisarPDF(texto, filename)  →  { tipo: 'single'|'multi', construtora, ... }
   │
   ├── tipo === 'single' ──►  processarSingle(buffer, analise)
   │                            • manda o PDF INTEIRO (base64) como `type:'file'`
   │                            • gpt-4.1 vê todas as páginas e consolida
   │                            • deduplicar()
   │
   └── tipo === 'multi'  ──►  processarMulti(buffer, analise, textoNativo)
                                • renderiza cada página em PNG (scale 3)
                                • corta cada página em 3 FAIXAS horizontais (tiling, overlap 6%)
                                • processa cada faixa: imagem (detail:high) + TEXTO NATIVO
                                • deduplicar()
   │
   ▼
status 'aguardando_confirmacao'  →  usuário revisa na tela  →  /api/confirmar  →  tabela `lancamentos`
```

---

## 5. As 3 decisões de arquitetura que fazem isto funcionar

Estas três descobertas foram validadas com tentativa-e-erro e são o **núcleo
inegociável** do pipeline:

### 5.1. Por que NÃO usar texto puro do `pdf-parse` para extrair
O `pdf-parse.getText()` **destrói a estrutura espacial** de tabelas com células
mescladas: lê os objetos do PDF na ordem interna, não na ordem visual. No
Cyrela e no Tibério, os nomes dos empreendimentos saem dissociados das linhas
de dados (nomes/bairros amontoados numa seção separada). **Texto puro sozinho
não permite associar nome ↔ dados.** Por isso a extração usa VISÃO.

### 5.2. SINGLE vs MULTI — estratégias diferentes (proposital)
- **SINGLE** (1 empreendimento, poucas tipologias espalhadas em muitas páginas):
  manda o **PDF inteiro** como arquivo. O modelo vê tudo e consolida. Validado:
  Metropolitan → Studio, 1 dorm, 2 dorms, 2 suítes, valores corretos, sem KITs.
- **MULTI** (vários empreendimentos, tabela densa): **renderização por página em
  alta resolução + tiling**. Mandar o PDF inteiro de um multi falha por baixa
  resolução ("laziness" + fonte ilegível).

### 5.3. MULTI = tiling em alta resolução + TEXTO NATIVO como referência
- **Tiling**: a OpenAI reduz qualquer imagem para caber em 2048px. Aumentar o
  `scale` global NÃO ajuda (e scale 4 piorou). A solução é **cortar a página em
  faixas** — cada faixa usa os 2048px para uma fração da página, multiplicando a
  resolução efetiva e reduzindo erros de associação.
- **Texto nativo junto da imagem**: a visão pura **alucina nomes** (ex.: "Cyrela
  Bosque" no lugar de "Cyrela Ibirapuera", nomes inventados como "Camila Moema")
  e **perde valores**. O texto nativo do `pdf-parse` tem os **nomes e valores
  EXATOS** (texto digital, não OCR). Enviar a imagem (para ASSOCIAR) + o texto
  nativo (para os NOMES/VALORES corretos) elimina alucinações e preenche valores.
- **REGRA ABSOLUTA do texto nativo (v1.1)**: o texto nativo é o documento INTEIRO.
  Cada faixa deve extrair **apenas as linhas VISÍVEIS na sua imagem** e usar o texto
  só como dicionário de correção. Sem essa regra, o modelo extrai linhas do texto que
  não estão na faixa → duplicação ~3x. Não remover esta instrução.

### 5.4. O prompt MULTI é GENÉRICO (v1.1) — não específico de uma construtora
Tabelões têm layouts diferentes (retrato/paisagem, nº de colunas, agregado por
tipologia como o Cyrela vs. unidades individuais como o Danti). O `SYSTEM_PROMPT_MULTI`
descreve **princípios universais** (células mescladas, extrair todos os blocos,
agregar por tipologia consolidando `valor_minimo`/`valor_maximo`, `unidades` = quantidade
e nunca o número do apartamento). **Não reescreva o prompt para um layout específico** —
isso faz o modelo descartar empreendimentos em PDFs de outro formato (foi o bug que o
Danti revelou: prompt enviesado para o Cyrela trazia 29 de ~50 linhas).

---

## 6. Parâmetros congelados (valores exatos)

| Parâmetro | Valor | Onde | Por quê |
|-----------|-------|------|---------|
| Modelo classificador | `gpt-4o-mini` | `openai.ts` | barato, só classifica |
| Modelo extrator | `gpt-4.1` | `openai.ts` | visão + aderência a JSON |
| `temperature` | `0` | todas as chamadas | máximo determinismo (v1.2) |
| `response_format` | `json_object` | todas | saída estruturada |
| Render scale (multi) | `3` | `renderizarPaginas` | alta resolução |
| Nº de faixas (tiling) | `3`, `4` ou `5` | `numFaixasPorDocumento` | baseado em **nº de páginas** (+ hint de empreendimentos); v1.2 |
| Retentativas por faixa | `3` | `_extrairDeImagem`, `_extrairDePdf` | retry em vazio/truncado; v1.2 |
| Segunda passagem faixas vazias | sim | `extrairFaixasComCobertura` | reprocessa faixas que falharam; v1.2 |
| Limite faixas vazias | `15%` | `extrairFaixasComCobertura` | erro se cobertura insuficiente; v1.2 |
| Overlap das faixas | `3%` (`0.03`) | `cortarEmFaixas` | cobre fronteira sem duplicar demais |
| `max_tokens` (single) | `16000` | `_extrairDePdf` | resposta cabe |
| `max_tokens` (multi/faixa) | `16000` | `_extrairDeImagem` | resposta por faixa cabe |
| Texto nativo enviado | primeiros `22000` chars | `_extrairDeImagem` | referência de nomes/valores |
| Texto p/ classificador | primeiros `8000` chars | `analisarPDF` | basta para classificar |
| `detail` da imagem | `high` | `_extrairDeImagem` | leitura de fonte pequena |

> ⚠️ **Histórico de erro a NÃO repetir:** `max_tokens: 16000` no fluxo *com PDF
> inteiro + texto nativo* truncava o JSON e o `catch` silenciava a página inteira
> (resultado caía para ~35 linhas). No fluxo atual (tiling, uma faixa por chamada),
> 16000 é suficiente por faixa. Não reduza esse valor.

---

## 7. Regras de negócio embutidas nos prompts (NÃO REMOVER)

**SINGLE** (`SYSTEM_PROMPT_SINGLE`):
- Uma linha por tipologia; inclui suítes (2/3/4 suítes).
- **IGNORA KITs** (Kit Conforto/Automação/Acabamento) — não são imóveis.
- Valores por andar → agrupa em `valor_minimo`/`valor_maximo`.
- Tabelas de pagamento → resumo em `mais_detalhes`.

**MULTI** (`SYSTEM_PROMPT_MULTI`) — **genérico para qualquer layout** (v1.1):
- Células mescladas (genérico): cada linha herda região/bairro/empreendimento da célula acima/à esquerda; não propagar para o bloco de outro empreendimento.
- Extrair TODOS os empreendimentos e linhas — não descartar blocos por layout incomum.
- **Agregar por tipologia**: uma linha por (empreendimento + tipologia + metragem); várias unidades da mesma tipologia → consolidar `valor_minimo`/`valor_maximo`.
- `unidades` = quantidade **somente** se a tabela informar; número de apartamento individual → `null`.
- Extrair **apenas o visível na faixa**; texto nativo é dicionário de correção (ver 5.3).
- Em faixa sem cabeçalho: inferir bairro pelo **endereço** ou pelo texto nativo.
- `bairro` normalizado "Bairro, Cidade"; nome de empreendimento limpo, sem sufixos.

**Classificador** (`analisarPDF`):
- Usa a **MARCA** da construtora (Lindenberg, Cyrela…), nunca a razão social do rodapé.
- Usa o **nome do arquivo** como indício forte da construtora.

**Pós-processamento** (`deduplicar`) — **consolida, não descarta** (v1.1):
- Chave normalizada: empreendimento e tipologia em minúsculo/sem acentos/sem
  pontuação; metragem reduzida aos números (ex.: "Garden 167m²" e "167m²" → `167`).
  Isso remove duplicatas de overlap mesmo com leituras ligeiramente diferentes.
- Ao colapsar a mesma chave: **mescla** — `valor_minimo` = menor, `valor_maximo` =
  maior, e preenche campos vazios a partir da outra entrada (preserva a faixa de
  valores quando há várias unidades da mesma tipologia, ex.: Danti).

---

## 8. Schema da tabela `lancamentos` (referência)

```
construtora, empreendimento, endereco, bairro, data_entrega,
metragem, tipologia, vagas, unidades, valor_minimo, valor_maximo,
desconto_margem, mais_detalhes (JSONB), processamento_id
```

`valor_minimo`/`valor_maximo`: numéricos puros (sem R$, sem separador de milhar).
`mais_detalhes`: JSON livre — links (Cyrela), tabela de pagamento (Lindenberg),
status/observações (Tibério/Vitaurbana).

---

## 9. Limitações conhecidas e aceitas (não são bugs a "consertar" no pipeline)

- **Bairro em regiões de mesclagem muito longa** (ex.: Mandarim → Brooklin no
  Cyrela): quando uma faixa não contém o cabeçalho da região, o bairro pode sair
  impreciso. **Mitigação por design:** a tela de revisão permite correção humana
  antes de salvar. Não tente "resolver" isso alterando o pipeline.
- **Variação entre execuções**: por ser leitura visual, a contagem exata pode
  variar levemente entre processamentos do mesmo PDF. Esperado.
- **Custo/tempo do multi**: ~3 chamadas por página (tiling). Trade-off aceito em
  troca de cobertura e precisão.

A tela de revisão (`/mapeamento/[id]`) é parte do contrato: o pipeline entrega
~90–95% e o humano confirma. **Isso é intencional.**

---

## 10. Como verificar que o pipeline continua íntegro

Antes de mergear qualquer feature nova, confirme que nada abaixo mudou:

1. `npx tsc --noEmit` sem erros.
2. `src/lib/ai-lancamentos.ts` conforme parâmetros da seção 6 (v1.2).
3. Reprocessar os 3 PDFs de referência e conferir:
   - **Metropolitan** (single): 4–5 tipologias, sem KITs, valores corretos.
   - **Tibério** (multi): construtora "Tibério", empreendimentos com bairro/entrega.
   - **Cyrela** (multi): nomes reais sem alucinação (Cyrela ZEN, Éden Park by Dror…), valores preenchidos.

Se algum desses regredir, a alteração que causou isso deve ser revertida.

---

## 11. Histórico de versões deste documento

- **v1.0** — Congelamento inicial. Pipeline híbrido (single = PDF inteiro;
  multi = tiling alta-res + texto nativo) validado nos 3 PDFs de referência.
- **v1.1** — Generalização do fluxo MULTI (decisão do dono, motivada pelo PDF
  Danti, layout paisagem). Mudanças: (a) `SYSTEM_PROMPT_MULTI` reescrito genérico
  (sem viés de layout); (b) regra absoluta "extrair apenas o visível na faixa,
  texto nativo é dicionário" — corrige duplicação ~3x; (c) `deduplicar` passa a
  consolidar `valor_minimo`/`valor_maximo` com chave normalizada; (d) `unidades`
  nunca recebe o número do apartamento; (e) overlap das faixas 6% → 3%. Validado
  em Danti (todos os empreendimentos, incl. Vista Brooklin) e Cyrela (sem regressão).
- **v1.2** — Fidelidade + anti-duplicata (decisão explícita do dono). Mudanças:
  (a) `temperature: 0`; (b) até 3 retentativas por faixa/PDF em resposta vazia ou
  truncada; (c) `extrairFaixasComCobertura` — segunda passagem nas faixas vazias
  e erro se >15% das faixas falharem; (d) `numFaixasPorDocumento` usa nº de
  páginas (determinístico) em single e multi; (e) `content_hash` SHA-256 no upload
  com HTTP 409 para PDF já enviado.
