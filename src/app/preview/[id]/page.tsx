'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import type { Lancamento } from '@/lib/types'
import { LancamentoMobileCard } from '@/components/lancamento-mobile-card'
import { LancamentosTable } from '@/components/lancamentos-table'

export default function PreviewPage() {
  const params = useParams()
  const id = params.id as string

  const [resultado, setResultado] = useState<{ inseridos: number; erros: unknown[] } | null>(null)
  const [status, setStatus] = useState('')
  const [erro, setErro] = useState('')
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [analise, setAnalise] = useState<{ tipo: string; construtora: string } | null>(null)

  useEffect(() => {
    async function fetchData() {
      const res = await fetch(`/api/processamentos/${id}`)
      const data = await res.json()
      setStatus(data.status)
      setErro(data.erro || '')
      if (data.resultado) setResultado(data.resultado)
      if (data.analise_ia) setAnalise(data.analise_ia)

      const { data: rows } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('processamento_id', id)
        .order('construtora')
        .order('empreendimento')
      setLancamentos((rows ?? []) as Lancamento[])
    }
    fetchData()
  }, [id])

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Resultado do Processamento</h1>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:underline touch-manipulation">← Dashboard</Link>
      </div>

      {status === 'concluido' && resultado && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Lançamentos salvos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{resultado.inseridos}</p>
            </CardContent>
          </Card>
          {analise && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500">Tipo</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={analise.tipo === 'multi' ? 'secondary' : 'default'}>
                    {analise.tipo === 'multi' ? 'Multi' : 'Single'}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500">Construtora</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-semibold truncate">{analise.construtora}</p>
                </CardContent>
              </Card>
            </>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Erros</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">{resultado.erros?.length ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {status === 'erro' && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="py-6">
            <p className="text-red-700 font-medium">{erro}</p>
          </CardContent>
        </Card>
      )}

      {lancamentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lançamentos ({lancamentos.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="md:hidden p-3 space-y-3">
              {lancamentos.map(l => (
                <LancamentoMobileCard key={l.id} lancamento={l} showPdf={false} />
              ))}
            </div>
            <div className="hidden md:block p-1">
              <LancamentosTable lancamentos={lancamentos} showPdf={false} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
