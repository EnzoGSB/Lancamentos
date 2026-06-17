import { createPDFParser } from './pdf-parse-server'

export type ThumbnailPagina = {
  pagina: number
  dataUrl: string
}

/** Gera miniaturas em baixa resolução para a tela de preparação. */
export async function gerarMiniaturasPdf(buffer: Buffer, scale = 0.75): Promise<ThumbnailPagina[]> {
  const parser = createPDFParser(buffer)
  try {
    const result = await parser.getScreenshot({ scale, base64: true } as { scale: number })
    return (result.pages ?? []).map((p: { dataUrl?: string; base64?: string }, i: number) => {
      const dataUrl = p.dataUrl ?? `data:image/png;base64,${p.base64 ?? ''}`
      return { pagina: i + 1, dataUrl }
    })
  } finally {
    await parser.destroy()
  }
}
