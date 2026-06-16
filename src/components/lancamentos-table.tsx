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

const TH_VALOR = cn(LANCAMENTO_TH, 'min-w-[6.5rem]')
const TD_VALOR = cn(LANCAMENTO_TD_NUM, 'text-right min-w-[6.5rem]')
const TH_METRAGEM = cn(LANCAMENTO_TH, 'min-w-[5.5rem]')
const TD_METRAGEM = cn(LANCAMENTO_TD_NUM, 'text-right min-w-[5.5rem]')

export function LancamentosTable({ lancamentos, showPdf = true, fontSizePx }: LancamentosTableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn('w-full min-w-[1180px] border-collapse', fontSizePx == null && 'text-xs')}
        style={fontSizePx != null ? { fontSize: fontSizePx } : undefined}
      >
        <thead>
          <tr className="border-b bg-gray-50">
            <th className={cn(LANCAMENTO_TH, 'min-w-[5.5rem]')}>Construtora</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[8rem]')}>Empreendimento</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[4.5rem]')}>Bairro</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[4rem]')}>Entrega</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[4rem]')}>Tipo</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[4.5rem]')}>Dormitórios</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[3.5rem]')}>Unidade</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[3.5rem]')}>Andar</th>
            <th className={TH_METRAGEM}>m²</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[3rem]')}>Vagas</th>
            <th className={TH_VALOR}>Mínimo</th>
            <th className={TH_VALOR}>Máximo</th>
            <th className={cn(LANCAMENTO_TH, 'min-w-[4rem]')}>Desconto</th>
            {showPdf && <th className={cn(LANCAMENTO_TH, 'min-w-[3rem]')}>PDF</th>}
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => (
            <tr key={l.id} className="border-b hover:bg-gray-50">
              <td className={cn(LANCAMENTO_TD_WRAP, 'font-medium min-w-[5.5rem]')}>{l.construtora}</td>
              <td className={cn(LANCAMENTO_TD_WRAP, 'min-w-[8rem]')} title={l.empreendimento}>
                {l.empreendimento}
              </td>
              <td className={cn(LANCAMENTO_TD_WRAP, 'min-w-[4.5rem]')}>
                <TextoCampoExibicao value={l.bairro} />
              </td>
              <td className={cn(LANCAMENTO_TD_NUM, 'min-w-[4rem]')}>
                {exibirCampo('data_entrega', l.data_entrega)}
              </td>
              <td className={cn(LANCAMENTO_TD_WRAP, 'min-w-[4rem]')}>{exibirTipoImovel(l.tipologia)}</td>
              <td className={cn(LANCAMENTO_TD_WRAP, 'min-w-[4.5rem]')}>
                {exibirDormitoriosImovel(l.tipologia)}
              </td>
              <td className={cn(LANCAMENTO_TD_NUM, 'text-center min-w-[3.5rem]')}>
                <TextoCampoExibicao value={l.unidade} />
              </td>
              <td className={cn(LANCAMENTO_TD_NUM, 'min-w-[3.5rem]')}>{exibirCampo('andar', l.andar)}</td>
              <td className={TD_METRAGEM}>
                <MetragemExibicao value={l.metragem} />
              </td>
              <td className={cn(LANCAMENTO_TD_NUM, 'text-center min-w-[3rem]')}>
                <VagasExibicao value={l.vagas} />
              </td>
              <td className={TD_VALOR}>
                <ValorMoedaExibicao value={l.valor_minimo} />
              </td>
              <td className={TD_VALOR}>
                <ValorMoedaExibicao value={l.valor_maximo} />
              </td>
              <td className={cn(LANCAMENTO_TD_WRAP, 'min-w-[4rem]')}>
                <TextoCampoExibicao value={l.desconto_margem} />
              </td>
              {showPdf && (
                <td className={cn(LANCAMENTO_TD, 'min-w-[3rem]')}>
                  <VerPdfButton processamentoId={l.processamento_id} size="xs" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
