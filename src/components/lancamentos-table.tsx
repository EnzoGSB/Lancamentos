import type { Lancamento } from '@/lib/types'
import { exibirCampo } from '@/lib/formatar-lancamento'
import { exibirDormitoriosImovel, exibirTipoImovel } from '@/lib/tipologia-filtro'
import { VerPdfButton } from '@/components/ver-pdf-button'
import {
  LANCAMENTO_TD,
  LANCAMENTO_TD_NUM,
  LANCAMENTO_TD_WRAP,
  LANCAMENTO_TH,
  MetragemExibicao,
  TextoCampoExibicao,
  ValorMoedaExibicao,
  VagasExibicao,
} from '@/components/lancamento-campos'
import { cn } from '@/lib/utils'

type LancamentosTableProps = {
  lancamentos: Lancamento[]
  showPdf?: boolean
  fontSizePx?: number
}

export function LancamentosTable({ lancamentos, showPdf = true, fontSizePx }: LancamentosTableProps) {
  return (
    <table
      className={cn('w-full table-fixed', fontSizePx == null && 'text-xs')}
      style={fontSizePx != null ? { fontSize: fontSizePx } : undefined}
    >
      <colgroup>
        <col style={{ width: '8%' }} />
        <col style={{ width: showPdf ? '13%' : '16%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '5%' }} />
        <col style={{ width: '5%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '5%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: showPdf ? '7%' : '9%' }} />
        {showPdf && <col style={{ width: '6%' }} />}
      </colgroup>
      <thead>
        <tr className="border-b bg-gray-50">
          <th className={LANCAMENTO_TH}>Construtora</th>
          <th className={LANCAMENTO_TH}>Empreendimento</th>
          <th className={LANCAMENTO_TH}>Bairro</th>
          <th className={LANCAMENTO_TH}>Entrega</th>
          <th className={LANCAMENTO_TH}>Tipo</th>
          <th className={LANCAMENTO_TH}>Dormitórios</th>
          <th className={LANCAMENTO_TH}>Unidade</th>
          <th className={LANCAMENTO_TH}>Andar</th>
          <th className={LANCAMENTO_TH}>m²</th>
          <th className={LANCAMENTO_TH}>Vagas</th>
          <th className={LANCAMENTO_TH}>Mínimo</th>
          <th className={LANCAMENTO_TH}>Máximo</th>
          <th className={LANCAMENTO_TH}>Desconto</th>
          {showPdf && <th className={LANCAMENTO_TH}>PDF</th>}
        </tr>
      </thead>
      <tbody>
        {lancamentos.map(l => (
          <tr key={l.id} className="border-b hover:bg-gray-50">
            <td className={cn(LANCAMENTO_TD_WRAP, 'font-medium')}>{l.construtora}</td>
            <td className={LANCAMENTO_TD_WRAP} title={l.empreendimento}>{l.empreendimento}</td>
            <td className={LANCAMENTO_TD_WRAP}>
              <TextoCampoExibicao value={l.bairro} />
            </td>
            <td className={LANCAMENTO_TD_NUM}>{exibirCampo('data_entrega', l.data_entrega)}</td>
            <td className={LANCAMENTO_TD_WRAP}>{exibirTipoImovel(l.tipologia)}</td>
            <td className={LANCAMENTO_TD_WRAP}>{exibirDormitoriosImovel(l.tipologia)}</td>
            <td className={cn(LANCAMENTO_TD_NUM, 'text-center')}>
              <TextoCampoExibicao value={l.unidade} />
            </td>
            <td className={LANCAMENTO_TD_NUM}>{exibirCampo('andar', l.andar)}</td>
            <td className={cn(LANCAMENTO_TD_NUM, 'text-right overflow-hidden')}>
              <MetragemExibicao value={l.metragem} className="w-full" />
            </td>
            <td className={cn(LANCAMENTO_TD_NUM, 'text-center')}>
              <VagasExibicao value={l.vagas} />
            </td>
            <td className={cn(LANCAMENTO_TD_NUM, 'text-right')}>
              <ValorMoedaExibicao value={l.valor_minimo} />
            </td>
            <td className={cn(LANCAMENTO_TD_NUM, 'text-right')}>
              <ValorMoedaExibicao value={l.valor_maximo} />
            </td>
            <td className={LANCAMENTO_TD_WRAP}>
              <TextoCampoExibicao value={l.desconto_margem} />
            </td>
            {showPdf && (
              <td className={LANCAMENTO_TD}>
                <VerPdfButton processamentoId={l.processamento_id} size="xs" />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
