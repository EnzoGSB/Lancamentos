type ProcessamentoProgressBarProps = {
  percent: number
  label?: string
  sublabel?: string
}

export function ProcessamentoProgressBar({
  percent,
  label,
  sublabel,
}: ProcessamentoProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      {label && (
        <p className="text-lg font-medium text-gray-700 text-center">{label}</p>
      )}
      <div className="flex items-center gap-3">
        <div
          className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden"
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ?? 'Progresso estimado'}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${clamped}%` }}
          />
        </div>
        <span className="text-sm font-medium tabular-nums text-gray-600 w-10 text-right">
          {clamped}%
        </span>
      </div>
      {sublabel && (
        <p className="text-sm text-gray-400 text-center">{sublabel}</p>
      )}
    </div>
  )
}
