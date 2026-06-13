import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { STATUS_CANCELAVEL } from '@/lib/processamento-cancelado'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const status = body.status as string | undefined

  if (status !== 'pendente') {
    return NextResponse.json({ error: 'Apenas reenfileirar (status pendente) é suportado.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .update({ status: 'pendente', erro: null })
    .eq('id', id)
    .eq('status', 'erro')
    .select('id, status')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json({ error: 'Processamento não encontrado ou não está em erro.' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: proc, error: procError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, storage_path, original_filename, status')
    .eq('id', id)
    .single()

  if (procError || !proc) {
    return NextResponse.json({ error: 'Processamento não encontrado' }, { status: 404 })
  }

  const emExecucao = STATUS_CANCELAVEL.includes(
    proc.status as (typeof STATUS_CANCELAVEL)[number]
  )

  try {
    const { count, error: lancError } = await supabaseAdmin
      .from('lancamentos')
      .delete({ count: 'exact' })
      .eq('processamento_id', id)

    if (lancError) throw new Error(lancError.message)

    if (proc.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('pdfs')
        .remove([proc.storage_path])

      if (storageError) throw new Error(`Erro ao apagar PDF: ${storageError.message}`)
    }

    if (emExecucao) {
      const { error: cancelError } = await supabaseAdmin
        .from('processamentos_lancamentos')
        .update({
          status: 'cancelado',
          erro: 'Cancelado ao apagar o PDF',
          storage_path: null,
        })
        .eq('id', id)

      if (cancelError) throw new Error(cancelError.message)

      return NextResponse.json({
        ok: true,
        id,
        cancelado: true,
        lancamentosRemovidos: count ?? 0,
        arquivo: proc.original_filename,
      })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('processamentos_lancamentos')
      .delete()
      .eq('id', id)

    if (deleteError) throw new Error(deleteError.message)

    return NextResponse.json({
      ok: true,
      id,
      lancamentosRemovidos: count ?? 0,
      arquivo: proc.original_filename,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao apagar processamento'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
