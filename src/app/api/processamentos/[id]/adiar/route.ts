import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { adiarProcessamentoNaFila } from '@/lib/processamento-adiado'
import { agendarAvancoFilaServidor } from '@/lib/processamento-fila-server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await adiarProcessamentoNaFila(supabaseAdmin, id)

  if (!result.ok) {
    if (result.notFound) {
      return NextResponse.json({ error: result.erro }, { status: 404 })
    }
    if (result.invalidStatus) {
      return NextResponse.json({ error: result.erro }, { status: 400 })
    }
    return NextResponse.json({ error: result.erro }, { status: 500 })
  }

  agendarAvancoFilaServidor()

  return NextResponse.json({ ok: true, adiado: true })
}
