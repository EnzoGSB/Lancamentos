import type { Lancamento } from '@/lib/types'
import { exibirCampo } from '@/lib/formatar-lancamento'
import { VerPdfButton } from '@/components/ver-pdf-button'
import { cn } from '@/lib/utils'

function formatValor(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

const TH = 'text-left p-1.5 font-medium text-gray-500 leading-tight align-bottom'
const TD = 'p-1.5 align-top leading-snug'
const TD_WRAP = cn(TD, 'break-words [overflow-wrap:anywhere]')
const TD_NUM = cn(TD, 'tabular-nums whitespace-nowrap')

type LancamentosTableProps = {
  lancamentos: Lancamento[]
  showPdf?: boolean
}

export function LancamentosTable({ lancamentos, showPdf = true }: LancamentosTableProps) {
  return (
    <table className="w-full table-fixed text-xs">
      <colgroup>
        <col style={{ width: '7%' }} />
        <col style={{ width: showPdf ? '14%' : '18%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '6%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '5%' }} />
        <col style={{ width: '5%' }} />
        <col style={{ width: '6%' }} />
        <col style={{ width: '5%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: showPdf ? '6%' : '8%' }} />
        {showPdf && <col style={{ width: '6%' }} />}
      </colgroup>
      <thead>
        <tr className="border-b bg-gray-50">
          <th className={TH} title="Construtora">Constr.</th>
          <th className={TH} title="Empreendimento">Empreed.</th>
          <th className={TH} title="Bairro">Bairro</th>
          <th className={TH} title="Entrega">Entrega</th>
          <th className={TH} title="Tipologia">Tipol.</th>
          <th className={TH} title="Unidade">Unid.</th>
          <th className={TH} title="Andar">Andar</th>
          <th className={TH} title="Metragem">m²</th>
          <th className={TH} title="Vagas">Vagas</th>
          <th className={TH} title="Valor mínimo">Mín.</th>
          <th className={TH} title="Valor máximo">Máx.</th>
          <th className={TH} title="Desconto">Desc.</th>
          {showPdf && <th className={TH}>PDF</th>}
        </tr>
      </thead>
      <tbody>
        {lancamentos.map(l => (
          <tr key={l.id} className="border-b hover:bg-gray-50">
            <td className={cn(TD_WRAP, 'font-medium')}>{l.construtora}</td>
            <td className={TD_WRAP} title={l.empreendimento}>{l.empreendimento}</td>
            <td className={TD_WRAP}>{l.bairro ?? '—'}</td>
            <td className={TD_NUM}>{exibirCampo('data_entrega', l.data_entrega)}</td>
            <td className={TD_WRAP}>{exibirCampo('tipologia', l.tipologia)}</td>
            <td className={cn(TD_NUM, 'text-center')}>{l.unidade ?? '—'}</td>
            <td className={TD_NUM}>{exibirCampo('andar', l.andar)}</td>
            <td className={cn(TD_NUM, 'text-right')}>{exibirCampo('metragem', l.metragem)}</td>
            <td className={cn(TD_NUM, 'text-center')}>{l.vagas ?? '—'}</td>
            <td className={cn(TD_NUM, 'text-right')}>{formatValor(l.valor_minimo)}</td>
            <td className={cn(TD_NUM, 'text-right')}>{formatValor(l.valor_maximo)}</td>
            <td className={TD_WRAP}>{l.desconto_margem ?? '—'}</td>
            {showPdf && (
              <td className={TD}>
                <VerPdfButton processamentoId={l.processamento_id} size="xs" />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
