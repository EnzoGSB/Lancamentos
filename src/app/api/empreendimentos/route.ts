import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const construtoraId = searchParams.get('construtora_id')

  if (!construtoraId) {
    return NextResponse.json({ error: 'construtora_id é obrigatório' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('empreendimentos')
    .select('*')
    .eq('construtora_id', construtoraId)
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { nome, construtora_id, codigo } = body

  if (!nome || !construtora_id) {
    return NextResponse.json({ error: 'nome e construtora_id são obrigatórios' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('empreendimentos')
    .insert({ nome, construtora_id, codigo })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}