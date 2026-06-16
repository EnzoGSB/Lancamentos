import { NextResponse } from 'next/server'
import { agendarAvancoFilaServidor } from '@/lib/processamento-fila-server'

/** Dispara o processamento da fila no servidor (sem depender do navegador). */
export async function POST() {
  agendarAvancoFilaServidor()
  return NextResponse.json({ ok: true })
}
