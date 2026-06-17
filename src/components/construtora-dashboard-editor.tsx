'use client'

import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const PLACEHOLDER = 'A identificar'

type ConstrutoraDashboardEditorProps = {
  processamentoId: string
  construtoraAtual: string
  onUpdated: (nome: string) => void
}

export function ConstrutoraDashboardEditor({
  processamentoId,
  construtoraAtual,
  onUpdated,
}: ConstrutoraDashboardEditorProps) {
  const identificada = construtoraAtual !== PLACEHOLDER
  const [editando, setEditando] = useState(!identificada)
  const [valor, setValor] = useState(identificada ? construtoraAtual : '')
  const [salvando, setSalvando] = useState(false)

  const cancelar = () => {
    setValor(identificada ? construtoraAtual : '')
    setEditando(!identificada)
  }

  const salvar = async () => {
    const nome = valor.trim()
    if (!nome) {
      toast.error('Digite o nome da construtora')
      return
    }

    setSalvando(true)
    try {
      const res = await fetch(`/api/processamentos/${processamentoId}/construtora`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ construtora: nome }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar construtora')
        return
      }
      onUpdated(nome)
      setEditando(false)
      toast.success(`Construtora: ${nome}`)
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setSalvando(false)
    }
  }

  if (!editando) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium text-gray-800">{construtoraAtual}</span>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="p-0.5 text-gray-400 hover:text-gray-700 rounded"
          title="Editar construtora"
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 max-w-full">
      <Input
        value={valor}
        onChange={e => setValor(e.target.value)}
        placeholder="Nome da construtora"
        className="h-7 w-36 sm:w-44 text-sm"
        disabled={salvando}
        onKeyDown={e => {
          if (e.key === 'Enter') void salvar()
          if (e.key === 'Escape') cancelar()
        }}
      />
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        disabled={salvando}
        onClick={() => void salvar()}
        title="Salvar"
      >
        <Check className="size-3.5" />
      </Button>
      {identificada && (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={salvando}
          onClick={cancelar}
          title="Cancelar"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </span>
  )
}
