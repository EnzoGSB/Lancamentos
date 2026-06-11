'use client'

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogViewport,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const destructive = variant === 'destructive'

  return (
    <AlertDialogRoot open={open} onOpenChange={onOpenChange}>
      <AlertDialogPortal>
        <AlertDialogBackdrop />
        <AlertDialogViewport>
          <AlertDialogPopup>
            <div className="flex gap-4">
              {destructive && (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="size-5" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription
                  render={<div className="space-y-2 text-sm leading-relaxed text-muted-foreground" />}
                >
                  {description}
                </AlertDialogDescription>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialogClose
                render={<Button variant="outline" disabled={loading} />}
              >
                {cancelLabel}
              </AlertDialogClose>
              <Button
                variant={destructive ? 'destructive' : 'default'}
                className={cn(destructive && 'bg-red-600 text-white hover:bg-red-700')}
                disabled={loading}
                onClick={() => void onConfirm()}
              >
                {loading ? 'Aguarde...' : confirmLabel}
              </Button>
            </div>
          </AlertDialogPopup>
        </AlertDialogViewport>
      </AlertDialogPortal>
    </AlertDialogRoot>
  )
}
