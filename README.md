# Tabelões — Catalogador de Lançamentos Imobiliários via IA

Aplicação Next.js que recebe **PDFs de tabelas de vendas de construtoras** ("tabelões"),
extrai os dados com IA (visão + texto) e popula a tabela `lancamentos` no Supabase,
com **uma linha por tipologia por empreendimento**. O usuário revisa e confirma antes de salvar.

> 📄 **Leitura obrigatória antes de mexer na extração:**
> [`docs/PIPELINE-EXTRACAO-LANCAMENTOS.md`](./docs/PIPELINE-EXTRACAO-LANCAMENTOS.md)
> — o pipeline de extração está **validado e congelado**. Construa novas features
> ao redor dele, não dentro.

---

## Como rodar

```bash
npm install
npm run dev
```

App em `http://localhost:3000`.

Variáveis de ambiente (`.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

---

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind + shadcn/ui
- **Supabase** (Postgres + Storage)
- **OpenAI** `gpt-4o-mini` (classificação) e `gpt-4.1` (extração com visão)
- **pdf-parse** (texto nativo + renderização de páginas) e **sharp** (tiling de imagens)

---

## Fluxo do usuário

```
/upload  →  envia o PDF
   │
   ▼
/mapeamento/[id]  →  "Processar com IA" → revisa os lançamentos extraídos (editável)
   │                                         → "Confirmar e Salvar"
   ▼
/preview/[id]  →  resultado salvo
   │
   ▼
/  (Dashboard)  →  histórico de processamentos + total de lançamentos no banco
```

---

## Arquitetura da extração (resumo)

O coração é `src/lib/ai-lancamentos.ts`. O fluxo decide entre dois caminhos:

| Tipo | Quando | Estratégia |
|------|--------|-----------|
| **single** | PDF de 1 empreendimento (várias tipologias/páginas) | Manda o **PDF inteiro** (visão nativa); o modelo consolida |
| **multi** | Tabelão com vários empreendimentos | Renderiza páginas em alta-res, corta em **faixas** (tiling) e processa cada faixa + **texto nativo** como dicionário |

**Três princípios que fazem funcionar** (detalhados no doc):
1. Texto puro do `pdf-parse` **não basta** — quebra a associação nome↔dados em tabelas mescladas. Por isso usamos **visão**.
2. **Tiling** (cortar em faixas) supera o limite de 2048px da OpenAI e dá resolução para tabelas densas.
3. **Texto nativo junto da imagem** elimina alucinação de nomes e valores faltando — mas cada faixa extrai **só o que vê**, usando o texto apenas como dicionário.

O pós-processamento (`deduplicar`) consolida entradas da mesma tipologia (faixa de
`valor_minimo`/`valor_maximo`) e remove duplicatas de overlap com chave normalizada.

---

## Banco de dados

**`lancamentos`** (tabela mãe):
`construtora, empreendimento, endereco, bairro, data_entrega, metragem, tipologia,
vagas, unidades, valor_minimo, valor_maximo, desconto_margem, mais_detalhes (JSONB), processamento_id`

**`processamentos_lancamentos`**: rastreia cada upload (status, tipo, análise, resultado).

**Storage:** bucket `pdfs`.

---

## Estrutura de pastas

```
src/
  app/
    page.tsx                    # Dashboard
    upload/page.tsx             # Upload de PDF
    mapeamento/[id]/page.tsx    # Revisão dos lançamentos extraídos
    preview/[id]/page.tsx       # Resultado salvo
    api/
      upload/route.ts           # PDF → Storage + cria processamento
      processar/route.ts        # Orquestra extração via IA
      confirmar/route.ts        # Persiste lançamentos revisados
      processamentos/...        # Listagem/detalhe
      lancamentos/count/route.ts
  lib/
    ai-lancamentos.ts           # 🔒 PIPELINE DE EXTRAÇÃO (congelado — ver docs/)
    openai.ts                   # cliente + modelos
    supabase.ts / supabase-admin.ts
    types.ts                    # Lancamento, ProcessamentoLancamento, AnaliseIA, ...
docs/
  PIPELINE-EXTRACAO-LANCAMENTOS.md  # 🔒 documento imutável do pipeline
```

---

## PDFs de referência usados na validação

Em `../exs tabelos/`:
- **Metropolitan** (single) — empreendimento único, tabela de pagamento detalhada.
- **Cyrela** (multi) — tabelão retrato denso, hierárquico, fonte minúscula. Caso mais difícil.
- **Tibério** (multi) — tabelão com células mescladas verticais.
- **Vitaurbana** (multi) — tabelão por região.
- **Danti / Parcerias Lindenberg** (multi) — layout paisagem, 15 colunas, unidades individuais.

O pipeline foi validado para extrair os cinco sem viés de layout.

---

## Limitações conhecidas (por design, não bugs)

- A extração visual atinge ~90–95%. Erros residuais (um dígito, um bairro de mesclagem
  muito longa) são corrigidos na **tela de revisão** antes de salvar — isso é intencional.
- O fluxo multi faz ~3 chamadas por página (tiling): mais lento/caro, em troca de cobertura e precisão.

---

## Regra de ouro para evolução

A extração (`src/lib/ai-lancamentos.ts` + prompts + parâmetros) está **congelada e
documentada**. Antes de qualquer mudança nela, leia `docs/PIPELINE-EXTRACAO-LANCAMENTOS.md`
e a seção correspondente do `AGENTS.md`. Novas funcionalidades (autenticação, filtros,
exportação, relatórios, etc.) devem ser construídas **ao redor** do pipeline.
