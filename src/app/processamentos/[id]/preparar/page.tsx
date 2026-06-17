'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarPaginas, parsearPaginas } from '@/lib/pdf-page-ranges'
import { EVENTO_FILA_ATUALIZADA, tentarProcessarProximo } from '@/lib/processamento-fila-worker'
import { cn } from '@/lib/utils'

type ThumbnailPagina = {
  pagina: number
  dataUrl: string
}

type PrepararData = {
  id: string
  filename: string | null
  pageCount: number
  miniaturas: ThumbnailPagina[]
}

export default function PrepararPaginasPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<PrepararData | null>(null)
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set())
  const [textoPaginas, setTextoPaginas] = useState('')
  const [ultimoClique, setUltimoClique] = useState<number | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let ativo = true
    setLoading(true)
    setErro(null)

    fetch(`/api/processamentos/${id}/preparar`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar PDF')
        if (!ativo) return
        setDados({
          id: data.id,
          filename: data.filename,
          pageCount: data.pageCount,
          miniaturas: data.miniaturas ?? [],
        })
      })
      .catch(err => {
        if (!ativo) return
        setErro(err instanceof Error ? err.message : 'Erro ao carregar')
      })
      .finally(() => {
        if (ativo) setLoading(false)
      })

    return () => { ativo = false }
  }, [id])

  const sincronizarTexto = useCallback((paginas: Set<number>) => {
    setTextoPaginas(formatarPaginas([...paginas]))
  }, [])

  const togglePagina = useCallback((pagina: number, shiftKey: boolean) => {
    setSelecionadas(prev => {
      const next = new Set(prev)

      if (shiftKey && ultimoClique != null && dados) {
        const inicio = Math.min(ultimoClique, pagina)
        const fim = Math.max(ultimoClique, pagina)
        for (let p = inicio; p <= fim; p++) next.add(p)
      } else if (next.has(pagina)) {
        next.delete(pagina)
      } else {
        next.add(pagina)
      }

      sincronizarTexto(next)
      return next
    })
    setUltimoClique(pagina)
  }, [dados, ultimoClique, sincronizarTexto])

  const handleTextoChange = (valor: string) => {
    setTextoPaginas(valor)
    if (!dados) return

    const parsed = parsearPaginas(valor, dados.pageCount)
    if (parsed.ok) {
      setSelecionadas(new Set(parsed.paginas))
    }
  }

  const finalizar = useCallback(async (acao: 'remover' | 'pular') => {
    setEnviando(true)
    try {
      const body =
        acao === 'pular'
          ? { acao: 'pular' }
          : { acao: 'remover', paginas: [...selecionadas].sort((a, b) => a - b) }

      const res = await fetch(`/api/processamentos/${id}/preparar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erro ao preparar PDF')
        return
      }

      toast.success(
        acao === 'pular'
          ? 'PDF enviado para a fila de processamento'
          : selecionadas.size === 0
            ? 'PDF enviado para a fila de processamento'
            : `${selecionadas.size} página(s) removida(s) — processamento iniciado`
      )

      window.dispatchEvent(new CustomEvent(EVENTO_FILA_ATUALIZADA))
      void fetch('/api/processamentos/iniciar-proximo', { method: 'POST' })
      void tentarProcessarProximo()
      router.push('/dashboard')
    } catch {
      toast.error('Erro de rede ao preparar PDF')
    } finally {
      setEnviando(false)
    }
  }, [id, router, selecionadas])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-gray-500">
        <Loader2 className="size-8 animate-spin" />
        <p>Gerando miniaturas do PDF…</p>
      </div>
    )
  }

  if (erro || !dados) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-4 py-12">
        <p className="text-red-600">{erro ?? 'PDF não encontrado'}</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 min-h-[calc(100vh-8rem)]">
      <div className="flex-1 min-w-0">
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
            {dados.filename ?? 'PDF'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Remover páginas antes do processamento</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {dados.miniaturas.map(({ pagina, dataUrl }) => {
            const marcada = selecionadas.has(pagina)
            return (
              <button
                key={pagina}
                type="button"
                onClick={e => togglePagina(pagina, e.shiftKey)}
                className={cn(
                  'group relative rounded-lg border-2 border-dashed p-2 transition-colors text-left',
                  marcada
                    ? 'border-red-400 bg-red-50/60'
                    : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-white'
                )}
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dataUrl}
                    alt={`Página ${pagina}`}
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                  {marcada && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 pointer-events-none">
                      <X className="size-10 sm:size-14 text-red-600 stroke-[3]" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-center text-sm font-medium text-gray-700">
                  Página {pagina}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <aside className="w-full lg:w-80 xl:w-96 shrink-0">
        <div className="lg:sticky lg:top-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Remover páginas</h2>

          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-sm text-blue-900">
            Clique nas páginas para remover do documento. Você pode usar a tecla{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-blue-100 font-mono text-xs">Shift</kbd>{' '}
            para definir intervalos.
          </div>

          <p className="text-sm text-gray-600">
            Total de páginas: <strong className="text-gray-900">{dados.pageCount}</strong>
          </p>

          <div className="space-y-2">
            <Label htmlFor="paginas-remover">Páginas para remover:</Label>
            <Input
              id="paginas-remover"
              placeholder="exemplo: 1,5-8"
              value={textoPaginas}
              onChange={e => handleTextoChange(e.target.value)}
              disabled={enviando}
            />
            {textoPaginas && dados && !parsearPaginas(textoPaginas, dados.pageCount).ok && (
              <p className="text-xs text-red-600">
                {(parsearPaginas(textoPaginas, dados.pageCount) as { error: string }).error}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full h-11 bg-red-500 hover:bg-red-600 text-white"
              disabled={enviando || selecionadas.size >= dados.pageCount}
              onClick={() => finalizar('remover')}
            >
              {enviando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Remover páginas
                  <ArrowRight className="size-4 ml-1" />
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full"
              disabled={enviando}
              onClick={() => finalizar('pular')}
            >
              Processar sem remover
            </Button>
          </div>
        </div>
      </aside>
    </div>
  )
}
