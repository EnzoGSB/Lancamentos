import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { hashPdfContent } from '@/lib/pdf-content-hash'
import { contarPaginasPdf } from '@/lib/pdf-page-count'
import { gerarMiniaturasPdf } from '@/lib/pdf-thumbnails'
import { validarPaginasRemover } from '@/lib/pdf-page-ranges'
import { removerPaginasPdf } from '@/lib/pdf-remover-paginas'
import { agendarAvancoFilaServidor } from '@/lib/processamento-fila-server'

const SIGNED_URL_TTL_SEC = 3600

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: proc, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, status, original_filename, page_count, storage_path')
    .eq('id', id)
    .single()

  if (error || !proc) {
    return NextResponse.json({ error: 'Processamento não encontrado' }, { status: 404 })
  }

  if (proc.status !== 'aguardando_preparacao') {
    return NextResponse.json(
      { error: 'Este PDF não está aguardando preparação.' },
      { status: 400 }
    )
  }

  if (!proc.storage_path) {
    return NextResponse.json({ error: 'PDF não disponível' }, { status: 404 })
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from('pdfs')
    .download(proc.storage_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Erro ao baixar PDF' }, { status: 500 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const pageCount = proc.page_count ?? await contarPaginasPdf(buffer)
  const miniaturas = await gerarMiniaturasPdf(buffer)

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from('pdfs')
    .createSignedUrl(proc.storage_path, SIGNED_URL_TTL_SEC)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Erro ao gerar URL do PDF' }, { status: 500 })
  }

  return NextResponse.json({
    id: proc.id,
    filename: proc.original_filename,
    pageCount,
    pdfUrl: signed.signedUrl,
    miniaturas,
  })
}

async function enfileirarProcessamento(id: string) {
  await supabaseAdmin
    .from('processamentos_lancamentos')
    .update({ status: 'pendente', erro: null })
    .eq('id', id)
    .eq('status', 'aguardando_preparacao')

  agendarAvancoFilaServidor()
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const acao = body.acao as string | undefined

  const { data: proc, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, status, storage_path, page_count')
    .eq('id', id)
    .single()

  if (error || !proc) {
    return NextResponse.json({ error: 'Processamento não encontrado' }, { status: 404 })
  }

  if (proc.status !== 'aguardando_preparacao') {
    return NextResponse.json(
      { error: 'Este PDF não está aguardando preparação.' },
      { status: 400 }
    )
  }

  if (acao === 'pular') {
    await enfileirarProcessamento(id)
    return NextResponse.json({ ok: true, id, pageCount: proc.page_count })
  }

  if (acao !== 'remover') {
    return NextResponse.json({ error: 'Ação inválida. Use "remover" ou "pular".' }, { status: 400 })
  }

  const paginas = body.paginas as number[] | undefined
  if (!Array.isArray(paginas) || paginas.length === 0) {
    await enfileirarProcessamento(id)
    return NextResponse.json({ ok: true, id, pageCount: proc.page_count, semAlteracao: true })
  }

  const total = proc.page_count ?? 0
  const erroValidacao = validarPaginasRemover(paginas, total)
  if (erroValidacao) {
    return NextResponse.json({ error: erroValidacao }, { status: 400 })
  }

  if (!proc.storage_path) {
    return NextResponse.json({ error: 'PDF não disponível' }, { status: 404 })
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from('pdfs')
    .download(proc.storage_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Erro ao baixar PDF' }, { status: 500 })
  }

  const bufferOriginal = Buffer.from(await fileData.arrayBuffer())
  const bufferNovo = await removerPaginasPdf(bufferOriginal, paginas)
  const contentHash = hashPdfContent(bufferNovo)
  const pageCount = await contarPaginasPdf(bufferNovo)

  const { data: duplicado } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id')
    .eq('content_hash', contentHash)
    .neq('id', id)
    .maybeSingle()

  if (duplicado) {
    return NextResponse.json(
      { error: 'O PDF resultante já existe em outro processamento. Ajuste as páginas removidas.' },
      { status: 409 }
    )
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from('pdfs')
    .upload(proc.storage_path, bufferNovo, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .update({
      content_hash: contentHash,
      page_count: pageCount,
      status: 'pendente',
      erro: null,
    })
    .eq('id', id)
    .eq('status', 'aguardando_preparacao')

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  agendarAvancoFilaServidor()

  return NextResponse.json({
    ok: true,
    id,
    pageCount,
    paginasRemovidas: paginas.length,
  })
}
