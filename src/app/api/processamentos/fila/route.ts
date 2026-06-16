import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { STATUS_PROCESSAMENTO_OCUPADO } from '@/lib/fila-processamento'
import {
  obterProximoPendenteId,
  prepararFila,
} from '@/lib/processamento-fila-server'

/** Estado global da fila (sem limite de 50 do dashboard). */
export async function GET() {
  await prepararFila()

  const { data: emAndamento, error: busyError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('id, status, original_filename, created_at')
    .in('status', [...STATUS_PROCESSAMENTO_OCUPADO])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (busyError) {
    return NextResponse.json({ error: busyError.message }, { status: 500 })
  }

  if (emAndamento) {
    return NextResponse.json({
      ocupado: true,
      emAndamento,
      proximoId: null,
    })
  }

  const proximoId = await obterProximoPendenteId()

  return NextResponse.json({
    ocupado: false,
    emAndamento: null,
    proximoId,
  })
}
