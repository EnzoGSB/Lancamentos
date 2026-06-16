import { NextRequest, NextResponse } from 'next/server'
import { executarProcessamento } from '@/lib/executar-processamento'
import { agendarAvancoFilaServidor } from '@/lib/processamento-fila-server'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const { processamentoId } = await request.json()

  if (!processamentoId) {
    return NextResponse.json({ error: 'processamentoId é obrigatório' }, { status: 400 })
  }

  const result = await executarProcessamento(processamentoId)

  if (result.ok) {
    agendarAvancoFilaServidor()
    return NextResponse.json({
      analise: result.analise,
      lancamentos: result.lancamentos,
      fromCache: result.fromCache ?? false,
    })
  }

  if ('cancelled' in result) {
    agendarAvancoFilaServidor()
    return NextResponse.json({ cancelled: true }, { status: 200 })
  }

  if (result.busy) {
    return NextResponse.json(
      {
        error: result.erro,
        busy: true,
      },
      { status: 409 }
    )
  }

  if (result.notFound) {
    return NextResponse.json({ error: result.erro }, { status: 404 })
  }

  if (result.invalidStatus) {
    return NextResponse.json({ error: result.erro }, { status: 400 })
  }

  agendarAvancoFilaServidor()
  return NextResponse.json({ error: result.erro }, { status: 500 })
}
