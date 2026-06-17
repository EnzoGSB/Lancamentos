import { createPDFParser } from './pdf-parse-server'

/** Conta páginas via metadados do PDF (sem renderizar imagens). */
export async function contarPaginasPdf(buffer: Buffer): Promise<number> {
  const parser = createPDFParser(buffer)
  try {
    const info = await parser.getInfo()
    const total = info.total
    if (typeof total === 'number' && total > 0) return total
    return 1
  } finally {
    await parser.destroy()
  }
}
