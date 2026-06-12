import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

type VerPdfButtonProps = {
  processamentoId: string | null | undefined
  className?: string
  size?: 'sm' | 'xs'
}

export function urlPdfProcessamento(processamentoId: string) {
  return `/api/processamentos/${processamentoId}/pdf`
}

export function VerPdfButton({ processamentoId, className, size = 'sm' }: VerPdfButtonProps) {
  if (!processamentoId) return null

  return (
    <a
      href={urlPdfProcessamento(processamentoId)}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir PDF de origem"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white text-gray-600',
        'hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-colors',
        size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        className
      )}
    >
      <FileText className={size === 'xs' ? 'size-3' : 'size-3.5'} />
      Ver PDF
    </a>
  )
}
