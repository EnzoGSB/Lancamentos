export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Lancamento = {
  id: string
  construtora: string
  empreendimento: string
  endereco: string | null
  bairro: string | null
  data_entrega: string | null
  metragem: string | null
  tipologia: string | null
  unidade: string | null
  andar: string | null
  vagas: string | null
  valor_minimo: number | null
  valor_maximo: number | null
  desconto_margem: string | null
  mais_detalhes: Json | null
  processamento_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type ProcessamentoLancamento = {
  id: string
  storage_path: string
  original_filename: string | null
  content_hash: string | null
  page_count: number | null
  status: 'aguardando_preparacao' | 'pendente' | 'adiado' | 'extraindo' | 'analisando' | 'processando' | 'aguardando_confirmacao' | 'salvando' | 'concluido' | 'erro'
  tipo: 'single' | 'multi' | null
  analise_ia: Json | null
  lancamentos_ai: Json | null
  resultado: Json | null
  erro: string | null
  created_at: string | null
  updated_at: string | null
}

export type AnaliseIA = {
  tipo: 'single' | 'multi'
  construtora: string
  empreendimentos_identificados: string[]
  resumo: string
}

export type LancamentoAI = Omit<Lancamento, 'id' | 'created_at' | 'updated_at' | 'processamento_id'>
