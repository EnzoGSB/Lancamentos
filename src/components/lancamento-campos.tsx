import { Badge } from '@/components/ui/badge'
import {
  CAMPO_VAZIO,
  exibirCampo,
  formatValorMoeda,
  formatarVagas,
  metragemTemFaixa,
} from '@/lib/formatar-lancamento'
import { cn } from '@/lib/utils'

export const LANCAMENTO_TH =
  'text-left p-1.5 font-medium text-gray-500 leading-tight align-bottom whitespace-normal'
export const LANCAMENTO_TD = 'p-1.5 align-top leading-snug'
export const LANCAMENTO_TD_WRAP = cn(LANCAMENTO_TD, 'break-words [overflow-wrap:anywhere]')
export const LANCAMENTO_TD_NUM = cn(LANCAMENTO_TD, 'tabular-nums whitespace-nowrap')

export function CampoVazio({ className }: { className?: string }) {
  return <span className={cn('text-gray-300 tabular-nums', className)}>{CAMPO_VAZIO}</span>
}

export function MetragemExibicao({
  value,
  className,
}: {
  value: string | null | undefined
  className?: string
}) {
  const texto = exibirCampo('metragem', value)
  if (texto === CAMPO_VAZIO) return <CampoVazio className={className} />

  if (metragemTemFaixa(value)) {
    return (
      <span className={cn('block truncate tabular-nums', className)} title={texto}>
        {texto}
      </span>
    )
  }

  const match = texto.match(/^(.+?)\s+m²$/i)
  if (!match) {
    return (
      <span className={cn('block truncate tabular-nums', className)} title={texto}>
        {texto}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-baseline justify-end gap-0.5 tabular-nums',
        className
      )}
      title={texto}
    >
      <span className="truncate">{match[1]}</span>
      <span className="shrink-0 text-[0.85em] text-gray-400">m²</span>
    </span>
  )
}

export function VagasExibicao({
  value,
  className,
}: {
  value: string | null | undefined
  className?: string
}) {
  const v = formatarVagas(value)
  if (!v) return <CampoVazio className={className} />

  return (
    <Badge
      variant="secondary"
      className={cn(
        'h-5 min-w-[1.25rem] px-1.5 font-normal tabular-nums text-gray-700 bg-gray-100',
        className
      )}
    >
      {v}
    </Badge>
  )
}

export function ValorMoedaExibicao({
  value,
  className,
}: {
  value: number | null | undefined
  className?: string
}) {
  const texto = formatValorMoeda(value)
  if (texto === CAMPO_VAZIO) return <CampoVazio className={className} />
  return <span className={cn('tabular-nums', className)}>{texto}</span>
}

export function TextoCampoExibicao({
  value,
  className,
}: {
  value: string | null | undefined
  className?: string
}) {
  if (!value?.trim()) return <CampoVazio className={className} />
  return <span className={className}>{value}</span>
}
