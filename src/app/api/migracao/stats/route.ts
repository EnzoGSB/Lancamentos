import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { MIGRACAO_TABELAS } from '@/lib/migracao-sql'

export async function GET() {
  try {
    const counts: Record<string, number> = {}

    for (const tabela of MIGRACAO_TABELAS) {
      const { count, error } = await supabaseAdmin
        .from(tabela)
        .select('*', { count: 'exact', head: true })

      if (error) throw new Error(`${tabela}: ${error.message}`)
      counts[tabela] = count ?? 0
    }

    const { data: buckets, error: bucketError } = await supabaseAdmin.storage.listBuckets()
    if (bucketError) throw new Error(bucketError.message)

    const pdfsBucket = buckets?.find(b => b.name === 'pdfs')
    let arquivosPdfs = 0

    if (pdfsBucket) {
      const { data: files, error: filesError } = await supabaseAdmin.storage
        .from('pdfs')
        .list('uploads', { limit: 1000 })

      if (filesError) throw new Error(filesError.message)
      arquivosPdfs = files?.length ?? 0
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null

    return NextResponse.json({
      projectRef,
      supabaseUrl,
      counts,
      storage: {
        bucket: pdfsBucket ? 'pdfs' : null,
        arquivosUploads: arquivosPdfs,
      },
      geradoEm: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao ler estatísticas'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
