'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import type { Lancamento } from '@/lib/types'
import { exibirCampo } from '@/lib/formatar-lancamento'

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

  const formatValor = (v: number | null) =>
    v != null ? `R$ ${v.toLocaleString('pt-BR')}` : '—'

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Resultado do Processamento</h1>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">← Dashboard</Link>
      </div>

      {status === 'concluido' && resultado && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {['Construtora', 'Empreendimento', 'Bairro', 'Entrega', 'Tipologia', 'Unidade', 'Andar', 'Metragem', 'Vagas', 'Valor Mín.', 'Valor Máx.', 'Desconto'].map(h => (
                      <th key={h} className="text-left p-2 font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((l) => (
                    <tr key={l.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 whitespace-nowrap font-medium">{l.construtora}</td>
                      <td className="p-2 max-w-[200px] truncate" title={l.empreendimento}>{l.empreendimento}</td>
                      <td className="p-2 whitespace-nowrap">{l.bairro ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums">{exibirCampo('data_entrega', l.data_entrega)}</td>
                      <td className="p-2 whitespace-nowrap">{exibirCampo('tipologia', l.tipologia)}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums text-center">{l.unidade ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums">{exibirCampo('andar', l.andar)}</td>
                      <td className="p-2 whitespace-nowrap tabular-nums text-right">{exibirCampo('metragem', l.metragem)}</td>
                      <td className="p-2 whitespace-nowrap text-center">{l.vagas ?? '—'}</td>
                      <td className="p-2 whitespace-nowrap">{formatValor(l.valor_minimo)}</td>
                      <td className="p-2 whitespace-nowrap">{formatValor(l.valor_maximo)}</td>
                      <td className="p-2 whitespace-nowrap">{l.desconto_margem ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
