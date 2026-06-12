import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const SIGNED_URL_TTL_SEC = 3600

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: proc, error } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('storage_path, original_filename')
    .eq('id', id)
    .single()

  if (error || !proc) {
    return NextResponse.json({ error: 'Processamento não encontrado' }, { status: 404 })
  }

  if (!proc.storage_path) {
    return NextResponse.json({ error: 'PDF não disponível para este processamento' }, { status: 404 })
  }

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from('pdfs')
    .createSignedUrl(proc.storage_path, SIGNED_URL_TTL_SEC)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Erro ao abrir o PDF' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
