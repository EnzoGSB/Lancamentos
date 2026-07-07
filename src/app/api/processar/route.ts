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

  if ('continua' in result && result.continua) {
    agendarAvancoFilaServidor()
    return NextResponse.json({ continua: true }, { status: 202 })
  }

  if ('adiado' in result && result.adiado) {
    agendarAvancoFilaServidor()
    return NextResponse.json({ adiado: true })
  }

  if (result.ok) {
    agendarAvancoFilaServidor()
    return NextResponse.json({
      analise: result.analise,
      lancamentos: result.lancamentos,
      fromCache: result.fromCache ?? false,
    })
  }

  if ('cancelled' in result && result.cancelled) {
    agendarAvancoFilaServidor()
    return NextResponse.json({ cancelled: true }, { status: 200 })
  }

  if ('erro' in result) {
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

  return NextResponse.json({ error: 'Resposta inesperada do processamento' }, { status: 500 })
}
