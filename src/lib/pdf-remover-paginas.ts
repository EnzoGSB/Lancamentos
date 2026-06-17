import { PDFDocument } from 'pdf-lib'

/** Remove páginas 1-based e retorna novo PDF. */
export async function removerPaginasPdf(buffer: Buffer, paginasRemover: number[]): Promise<Buffer> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const total = src.getPageCount()
  const remover = new Set(paginasRemover)

  if (remover.size === 0) return buffer
  if (remover.size >= total) {
    throw new Error('Não é possível remover todas as páginas do documento.')
  }

  const novo = await PDFDocument.create()
  for (let i = 0; i < total; i++) {
    if (!remover.has(i + 1)) {
      const [pagina] = await novo.copyPages(src, [i])
      novo.addPage(pagina)
    }
  }

  const bytes = await novo.save()
  return Buffer.from(bytes)
}
