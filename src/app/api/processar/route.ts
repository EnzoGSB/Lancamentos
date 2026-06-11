import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { analisarPDF, processarSingle, processarMulti } from '@/lib/ai-lancamentos'
import { createPDFParser } from '@/lib/pdf-parse-server'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const { processamentoId } = await request.json()

  if (!processamentoId) {
    return NextResponse.json({ error: 'processamentoId é obrigatório' }, { status: 400 })
  }

  const { data: proc, error: procError } = await supabaseAdmin
    .from('processamentos_lancamentos')
    .select('*')
    .eq('id', processamentoId)
    .single()

  if (procError || !proc) {
    return NextResponse.json({ error: 'Processamento não encontrado' }, { status: 404 })
  }

  try {
    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({ status: 'extraindo' })
      .eq('id', processamentoId)

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('pdfs')
      .download(proc.storage_path)

    if (downloadError || !fileData) {
      throw new Error(`Erro ao baixar PDF: ${downloadError?.message}`)
    }

    const arrayBuffer = await fileData.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const parser = createPDFParser(buffer)
    const textResult = await parser.getText()
    const extractedText: string = textResult.text

    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error('Texto extraído do PDF está vazio ou muito curto. O PDF pode ser escaneado ou protegido.')
    }

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({ status: 'analisando' })
      .eq('id', processamentoId)

    const analise = await analisarPDF(extractedText, proc.original_filename || '')

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({ status: 'processando', tipo: analise.tipo, analise_ia: analise })
      .eq('id', processamentoId)

    const lancamentos = analise.tipo === 'single'
      ? await processarSingle(buffer, analise, extractedText)
      : await processarMulti(buffer, analise, extractedText)

    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({
        status: 'aguardando_confirmacao',
        lancamentos_ai: { lancamentos },
      })
      .eq('id', processamentoId)

    return NextResponse.json({ analise, lancamentos })

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
    await supabaseAdmin
      .from('processamentos_lancamentos')
      .update({ status: 'erro', erro: errorMessage })
      .eq('id', processamentoId)

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
