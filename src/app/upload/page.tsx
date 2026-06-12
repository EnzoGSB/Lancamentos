'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { salvarFilaBatch } from '@/lib/fila-processamento'

const MAX_ARQUIVOS = 20
const MAX_MB = 50

type UploadOk = { ok: true; id: string; name: string }
type UploadFail = { ok: false; name: string; error: string; duplicateId?: string }
type UploadResult = UploadOk | UploadFail

function filtrarPdfs(list: FileList | File[]) {
  return [...list].filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
}

function adicionarArquivos(prev: File[], incoming: File[]) {
  const map = new Map(prev.map(f => [`${f.name}-${f.size}`, f]))
  for (const f of incoming) {
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`${f.name} excede ${MAX_MB}MB`)
      continue
    }
    map.set(`${f.name}-${f.size}`, f)
  }
  const merged = [...map.values()]
  if (merged.length > MAX_ARQUIVOS) {
    toast.error(`Máximo de ${MAX_ARQUIVOS} PDFs por envio`)
    return merged.slice(0, MAX_ARQUIVOS)
  }
  return merged
}

async function enviarPdf(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: formData })
  const data = await res.json()

  if (res.ok) {
    return { ok: true, id: data.id, name: file.name }
  }
  if (res.status === 409 && data.duplicate && data.existing?.id) {
    return {
      ok: false,
      name: file.name,
      error: data.error || 'PDF duplicado',
      duplicateId: data.existing.id,
    }
  }
  return { ok: false, name: file.name, error: data.error || 'Erro no upload' }
}

export default function UploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null)
  const [falhas, setFalhas] = useState<UploadFail[]>([])

  const handleUpload = useCallback(async () => {
    if (files.length === 0) {
      toast.error('Selecione ao menos um PDF')
      return
    }

    setUploading(true)
    setFalhas([])
    setProgresso({ atual: 0, total: files.length })

    const sucessos: UploadOk[] = []
    const erros: UploadFail[] = []

    for (let i = 0; i < files.length; i++) {
      setProgresso({ atual: i + 1, total: files.length })
      const result = await enviarPdf(files[i])
      if (result.ok) sucessos.push(result)
      else erros.push(result)
    }

    setProgresso(null)
    setUploading(false)

    if (sucessos.length === 0) {
      setFalhas(erros)
      toast.error('Nenhum PDF foi enviado')
      return
    }

    if (erros.length > 0) {
      setFalhas(erros)
      toast.warning(`${sucessos.length} enviado(s), ${erros.length} com problema`)
    } else {
      toast.success(
        sucessos.length === 1
          ? 'Upload realizado!'
          : `${sucessos.length} PDFs enviados — fila iniciada no Dashboard`
      )
    }

    if (sucessos.length === 1) {
      router.push(`/mapeamento/${sucessos[0].id}`)
      return
    }

    salvarFilaBatch(sucessos.map(s => s.id))
    router.push('/dashboard')
  }, [files, router])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const pdfs = filtrarPdfs(e.dataTransfer.files)
    if (pdfs.length === 0) {
      toast.error('Apenas arquivos PDF são aceitos')
      return
    }
    setFiles(prev => adicionarArquivos(prev, pdfs))
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const pdfs = filtrarPdfs(e.target.files ?? [])
    if (pdfs.length > 0) setFiles(prev => adicionarArquivos(prev, pdfs))
    e.target.value = ''
  }, [])

  const removerArquivo = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Upload de Tabelão</h1>
      <p className="text-sm sm:text-base text-gray-500 mb-5 sm:mb-6">
        Envie um ou vários PDFs. A IA analisa cada arquivo, identifica empreendimentos e extrai tipologias.
        Com <strong className="font-medium text-gray-700">vários arquivos</strong>, o processamento entra em fila
        e você acompanha tudo no Dashboard.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            {files.length === 0
              ? 'Arquivos PDF'
              : `${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'} selecionado${files.length === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => document.getElementById('pdf-input')?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 sm:p-10 text-center cursor-pointer hover:border-gray-400 transition-colors touch-manipulation"
          >
            <p className="text-sm text-gray-500">Arraste PDFs aqui ou clique para selecionar</p>
            <p className="text-xs text-gray-400 mt-1">
              Até {MAX_ARQUIVOS} arquivos · máx. {MAX_MB}MB cada
            </p>
          </div>
          <input
            id="pdf-input"
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={handleInputChange}
          />

          {files.length > 0 && (
            <ul className="divide-y rounded-lg border border-gray-200 max-h-48 overflow-y-auto">
              {files.map((file, i) => (
                <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 truncate text-gray-900">{file.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removerArquivo(i) }}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    aria-label={`Remover ${file.name}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {falhas.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base text-amber-900">Problemas no envio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {falhas.map(f => (
              <div key={f.name} className="text-sm text-amber-900">
                <p className="font-medium">{f.name}</p>
                <p className="text-amber-800 mt-0.5">{f.error}</p>
                {f.duplicateId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => router.push(`/mapeamento/${f.duplicateId}`)}
                  >
                    Abrir processamento existente
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button
        onClick={handleUpload}
        disabled={uploading || files.length === 0}
        className="w-full h-12 text-base"
      >
        {uploading && progresso
          ? `Enviando ${progresso.atual} de ${progresso.total}...`
          : files.length > 1
            ? `Enviar ${files.length} PDFs e processar no Dashboard`
            : 'Enviar e Processar com IA'}
      </Button>
    </div>
  )
}
