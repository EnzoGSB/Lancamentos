'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type DuplicateInfo = {
  id: string
  message: string
}

export default function UploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null)

  const handleUpload = useCallback(async () => {
    if (!file) { toast.error('Selecione um arquivo PDF'); return }

    setUploading(true)
    setDuplicateInfo(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (res.ok) {
        toast.success('Upload realizado! Processando com IA...')
        router.push(`/mapeamento/${data.id}`)
      } else if (res.status === 409 && data.duplicate && data.existing?.id) {
        setDuplicateInfo({ id: data.existing.id, message: data.error })
        toast.error('Este PDF já foi enviado')
      } else {
        toast.error(data.error || 'Erro no upload')
      }
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setUploading(false)
    }
  }, [file, router])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile?.type === 'application/pdf') {
      setFile(droppedFile)
    } else {
      toast.error('Apenas arquivos PDF são aceitos')
    }
  }, [])

  return (
    <div className="w-full max-w-xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Upload de Tabelão</h1>
      <p className="text-sm sm:text-base text-gray-500 mb-5 sm:mb-6">
        A IA vai analisar o PDF automaticamente, identificar se é um único empreendimento ou múltiplos,
        e extrair todas as tipologias com seus dados.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Arquivo PDF</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => document.getElementById('pdf-input')?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 sm:p-12 text-center cursor-pointer hover:border-gray-400 transition-colors touch-manipulation"
          >
            {file ? (
              <div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  className="text-xs text-red-500 hover:underline mt-2"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">Arraste um PDF aqui ou clique para selecionar</p>
                <p className="text-xs text-gray-400 mt-1">Máximo 50MB</p>
              </div>
            )}
          </div>
          <input
            id="pdf-input"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }}
          />
        </CardContent>
      </Card>

      {duplicateInfo && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base text-amber-900">PDF duplicado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-amber-900">{duplicateInfo.message}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => router.push(`/mapeamento/${duplicateInfo.id}`)}
              >
                Abrir processamento existente
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
                Ir ao Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        onClick={handleUpload}
        disabled={uploading || !file}
        className="w-full h-12 text-base"
      >
        {uploading ? 'Enviando...' : 'Enviar e Processar com IA'}
      </Button>
    </div>
  )
}
