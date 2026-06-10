'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function UploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleUpload = useCallback(async () => {
    if (!file) { toast.error('Selecione um arquivo PDF'); return }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (res.ok) {
        toast.success('Upload realizado! Processando com IA...')
        router.push(`/mapeamento/${data.id}`)
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
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload de Tabelão</h1>
      <p className="text-sm text-gray-500 mb-6">
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
            className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition-colors"
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
