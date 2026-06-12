'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  clampFontSize,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from '@/lib/imoveis-font-size'

type ImoveisFontSizeControlProps = {
  value: number
  onApply: (size: number) => void
}

export function ImoveisFontSizeControl({ value, onApply }: ImoveisFontSizeControlProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const progress =
    ((clampFontSize(draft) - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)) * 100

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
      aria-label="Tamanho da letra"
    >
      <span className="text-xs font-semibold text-gray-500 leading-none select-none" aria-hidden>
        A
      </span>

      <div className="relative w-28 sm:w-36 flex items-center">
        <input
          type="range"
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          value={draft}
          onChange={e => setDraft(clampFontSize(Number(e.target.value)))}
          className="imoveis-font-slider w-full h-1.5 cursor-pointer appearance-none rounded-full bg-gray-300 outline-none"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progress}%, #d1d5db ${progress}%, #d1d5db 100%)`,
          }}
          aria-valuemin={FONT_SIZE_MIN}
          aria-valuemax={FONT_SIZE_MAX}
          aria-valuenow={draft}
          aria-label="Tamanho da letra"
        />
      </div>

      <span className="text-lg font-semibold text-gray-700 leading-none select-none" aria-hidden>
        A
      </span>

      <Button
        type="button"
        size="sm"
        variant={draft === value ? 'outline' : 'default'}
        disabled={draft === value}
        onClick={() => onApply(clampFontSize(draft))}
        className="shrink-0 touch-manipulation"
      >
        Aplicar
      </Button>
    </div>
  )
}
