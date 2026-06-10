import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Arquivo PDF é obrigatório' }, { status: 400 })

  const fileName = `${uuidv4()}.pdf`
  const storagePath = `uploads/${fileName}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('pdfs')
    .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data, error: dbError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .insert({
      storage_path: storagePath,
      original_filename: file.name,
      status: 'pendente',
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
