import type { Lancamento } from '@/lib/types'
import { exibirCampo } from '@/lib/formatar-lancamento'
import { VerPdfButton } from '@/components/ver-pdf-button'
import { cn } from '@/lib/utils'

function formatValor(v: number | null) {
  return v != null ? `R$ ${v.toLocaleString('pt-BR')}` : '—'
}

type LancamentoMobileCardProps = {
  lancamento: Lancamento
  showPdf?: boolean
  fontSizePx?: number
}

export function LancamentoMobileCard({ lancamento: l, showPdf = true, fontSizePx }: LancamentoMobileCardProps) {
  const labelStyle = fontSizePx != null ? { fontSize: fontSizePx * 0.85 } : undefined
  const bodyStyle = fontSizePx != null ? { fontSize: fontSizePx } : undefined
  const labelClass = cn('text-gray-400', fontSizePx == null && 'text-xs')

  return (
    <div className={cn('rounded-xl border bg-white p-4 space-y-3', fontSizePx == null && 'text-sm')} style={bodyStyle}>
      <div>
        <p className="font-semibold text-gray-900 leading-snug">{l.empreendimento}</p>
        <p className={cn('text-gray-500 mt-0.5', fontSizePx == null && 'text-sm')} style={labelStyle}>
          {l.construtora}
          {l.bairro ? ` · ${l.bairro}` : ''}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className={labelClass} style={labelStyle}>Tipologia</dt>
          <dd className="text-gray-900">{exibirCampo('tipologia', l.tipologia)}</dd>
        </div>
        <div>
          <dt className={labelClass} style={labelStyle}>Unidade</dt>
          <dd className="text-gray-900 tabular-nums">{l.unidade ?? '—'}</dd>
        </div>
        <div>
          <dt className={labelClass} style={labelStyle}>Metragem</dt>
          <dd className="text-gray-900 tabular-nums">{exibirCampo('metragem', l.metragem)}</dd>
        </div>
        <div>
          <dt className={labelClass} style={labelStyle}>Vagas</dt>
          <dd className="text-gray-900">{l.vagas ?? '—'}</dd>
        </div>
        <div>
          <dt className={labelClass} style={labelStyle}>Entrega</dt>
          <dd className="text-gray-900 tabular-nums">{exibirCampo('data_entrega', l.data_entrega)}</dd>
        </div>
        <div>
          <dt className={labelClass} style={labelStyle}>Desconto</dt>
          <dd className="text-gray-900">{l.desconto_margem ?? '—'}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
        <div>
          <span className="text-gray-500" style={labelStyle}>Valor: </span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {formatValor(l.valor_minimo)}
            {l.valor_maximo != null && l.valor_maximo !== l.valor_minimo && (
              <> – {formatValor(l.valor_maximo)}</>
            )}
          </span>
        </div>
        {showPdf && <VerPdfButton processamentoId={l.processamento_id} size="sm" />}
      </div>
    </div>
  )
}
