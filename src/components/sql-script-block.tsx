'use client'

import { useCallback, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function SqlScriptBlock({
  sql,
  className,
}: {
  sql: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const copiar = useCallback(async () => {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [sql])

  return (
    <div className={cn('relative rounded-lg border bg-gray-950 text-gray-100', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">SQL</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copiar}
          className="h-8 border-gray-700 bg-gray-900 text-gray-100 hover:bg-gray-800 hover:text-white"
        >
          {copied ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">
        {sql}
      </pre>
    </div>
  )
}
