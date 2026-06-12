import OpenAI from 'openai'

export const AI_MODEL_ASSISTENTE = 'gpt-4o-mini'

let client: OpenAI | null = null

export function getOpenAIBusca(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY_BUSCA ?? process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY_BUSCA ou OPENAI_API_KEY deve estar configurada')
    }
    client = new OpenAI({ apiKey })
  }
  return client
}
