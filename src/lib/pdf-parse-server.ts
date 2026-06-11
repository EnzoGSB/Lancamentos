// Polyfill de DOMMatrix/ImageData/Path2D via @napi-rs/canvas — obrigatório no Node/Vercel
// antes de carregar pdf-parse (ver docs do pacote).
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('pdf-parse/worker')

type PDFParseConstructor = typeof import('pdf-parse').PDFParse

export function createPDFParser(data: Buffer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse') as { PDFParse: PDFParseConstructor }
  return new PDFParse({ data })
}
