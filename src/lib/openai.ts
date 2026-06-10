import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const AI_MODEL_ANALYZER = 'gpt-4o-mini'
export const AI_MODEL_EXTRACTOR = 'gpt-4.1'
