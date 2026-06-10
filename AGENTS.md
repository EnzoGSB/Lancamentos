# 🔒 PIPELINE DE EXTRAÇÃO — CONGELADO

O pipeline de extração de PDFs de lançamentos (classificação + extração via IA)
está **validado e congelado**. Antes de tocar em qualquer um destes arquivos,
leia **`docs/PIPELINE-EXTRACAO-LANCAMENTOS.md`** — ele é a fonte de verdade:

- `src/lib/ai-lancamentos.ts`
- `src/lib/openai.ts` (nomes dos modelos)
- `src/app/api/processar/route.ts`, `src/app/api/confirmar/route.ts`, `src/app/api/upload/route.ts`

**Não altere prompts, modelos, `scale`, número de faixas (tiling), `max_tokens`
ou o uso do texto nativo.** Novas funcionalidades devem ser construídas AO REDOR
deste fluxo, nunca dentro dele. Mexer aqui só por decisão explícita do dono do
projeto, com atualização deliberada do documento.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
