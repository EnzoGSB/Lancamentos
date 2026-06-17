import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { hashPdfContent } from '@/lib/pdf-content-hash'
import { contarPaginasPdf } from '@/lib/pdf-page-count'
import { agendarAvancoFilaServidor } from '@/lib/processamento-fila-server'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Arquivo PDF é obrigatório' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const contentHash = hashPdfContent(bytes)
  const pageCount = await contarPaginasPdf(bytes)

  const { data: existente, error: dupError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, original_filename, status, created_at')
    .eq('content_hash', contentHash)
    .maybeSingle()

  if (dupError && dupError.code !== 'PGRST116') {
    return NextResponse.json({ error: dupError.message }, { status: 500 })
  }

  if (existente) {
    const dataEnvio = existente.created_at
      ? new Date(existente.created_at).toLocaleString('pt-BR')
      : 'data desconhecida'
    return NextResponse.json(
      {
        error: `Este PDF já foi enviado em ${dataEnvio} ("${existente.original_filename ?? file.name}"). Exclua o processamento anterior no Dashboard para reenviar o mesmo arquivo.`,
        duplicate: true,
        existing: existente,
      },
      { status: 409 }
    )
  }

  const fileName = `${uuidv4()}.pdf`
  const storagePath = `uploads/${fileName}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('pdfs')
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data, error: dbError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .insert({
      storage_path: storagePath,
      original_filename: file.name,
      content_hash: contentHash,
      page_count: pageCount,
      status: 'pendente',
    })
    .select()
    .single()

  if (dbError) {
    await supabaseAdmin.storage.from('pdfs').remove([storagePath])
    if (dbError.code === '23505') {
      return NextResponse.json(
        { error: 'Este PDF já foi enviado anteriormente. Exclua o processamento existente no Dashboard.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  agendarAvancoFilaServidor()

  return NextResponse.json(data, { status: 201 })
}
