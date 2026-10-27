export interface Product {
  id: string;
  id_loja: number;
  codigo_interno: string;
  codigo_barras: string; // Crucial: stored as string to preserve leading zeros
  descricao: string;
  produto?: string; // Nome / Descrição completa
  preco: number;
  preco_venda?: number; // Preço de venda atual
  embalagem: string;
  ncm?: string;
  ativo?: boolean; // true = ATIVO, false = INATIVO
  hash?: string;
  atualizado_em: string;
  ultima_sincronizacao?: string;
}

export interface Store {
  id: number;
  nome: string;
  cnpj: string;
  endereco: string;
  ativa: boolean;
}

export interface Terminal {
  id: string;
  nome: string;
  id_loja: number;
  identificador: string;
  modelo_etiqueta_padrao_id: string;
  impressora_id: string;
  ultima_conexao: string;
  ultima_sincronizacao: string;
  status: 'ONLINE' | 'OFFLINE';
  versao: string;
}

export type ElementType =
  | 'descricao'
  | 'preco_completo'
  | 'preco_reais'
  | 'preco_centavos'
  | 'cifrao'
  | 'codigo_barras'
  | 'codigo_interno'
  | 'ean_texto'
  | 'embalagem'
  | 'ncm'
  | 'texto_fixo'
  | 'linha_horizontal'
  | 'linha_vertical'
  | 'retangulo'
  | 'separador';

export interface LabelElement {
  id: string;
  tipo: ElementType;
  slot: 1 | 2; // For 2-product labels: Product 1 or Product 2
  x: number; // in mm
  y: number; // in mm
  largura: number; // in mm
  altura: number; // in mm
  fonte: string;
  tamanho_fonte: number;
  negrito: boolean;
  alinhamento: 'left' | 'center' | 'right';
  alinhamento_v?: 'top' | 'middle' | 'bottom';
  rotacao: 0 | 90 | 180 | 270;
  quebra_linha: boolean;
  max_linhas: number;
  visivel: boolean;
  texto_personalizado?: string;
}

export interface LabelModel {
  id: string;
  nome: string;
  largura_mm: number;
  altura_mm: number;
  orientacao: 'paisagem' | 'retrato';
  produtos_por_etiqueta: 1 | 2;
  margem_esquerda: number;
  margem_direita: number;
  margem_superior: number;
  margem_inferior: number;
  gap: number;
  impressora_padrao?: string;
  velocidade?: number; // 2 to 4 inches/sec
  temperatura?: number; // 0 to 15 (Argox darkness)
  avanco?: number;
  padrao: boolean;
  ativo: boolean;
  elementos: LabelElement[];
}

export interface PrinterConfig {
  id: string;
  nome: string;
  tipo: 'argox_os214' | 'windows_spooler' | 'serial_raw' | 'zebra_zpl' | 'elgin_l42' | 'bematech' | 'network_raw' | string;
  linguagem: 'PPLA' | 'PPLB' | 'RAW' | 'ZPL' | 'EPL' | string;
  porta: string; // 'USB001' | 'COM1' | 'LPT1' | '192.168.1.150:9100'
  dpi: number; // Argox OS-214 is 203 DPI (~8 dots/mm)
  offset_x: number; // in mm
  offset_y: number; // in mm
  largura_calibrada: number; // in mm
  altura_calibrada: number; // in mm
  gap: number; // in mm
  avanco: number; // in mm
  padrao: boolean;
  online: boolean;
}

export interface ERPConfig {
  nome_loja?: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
  id_loja: number;
  id_situacaocadastro: number;
  intervalo_minutos: 1 | 5 | 10 | 15 | 30 | 60;
  sincronizacao_automatica: boolean;
  custom_query?: string;
}

export interface SyncLog {
  id: string;
  data_hora: string;
  status: 'SUCESSO' | 'ERRO';
  produtos_analisados: number;
  produtos_atualizados: number;
  produtos_novos: number;
  tempo_ms: number;
  erros?: string;
  id_loja: number;
}

export interface PrintJobProduct {
  codigo_interno: string;
  codigo_barras: string;
  descricao: string;
  preco: number;
  embalagem?: string;
  ncm?: string;
}

export interface PrintJob {
  id: string;
  data_hora: string;
  terminal_id: string;
  modelo_id: string;
  modelo_nome: string;
  impressora_id: string;
  produtos: PrintJobProduct[];
  status: 'PENDENTE' | 'ENVIANDO' | 'IMPRESSO' | 'ERRO';
  mensagem_erro?: string;
  comandos_raw?: string;
  tentativas: number;
}

export interface SystemLog {
  id: string;
  data_hora: string;
  tipo:
    | 'SINCRONIZACAO'
    | 'IMPRESSAO'
    | 'ERRO'
    | 'PRODUTO_NAO_ENCONTRADO'
    | 'CONEXAO'
    | 'ADMIN'
    | 'MODO_ETIQUETA';
  mensagem: string;
  detalhes?: any;
}

export interface SystemStatus {
  nome_loja?: string;
  erp_conectado: boolean;
  internet_online: boolean;
  banco_online: boolean;
  cache_local_atualizado: boolean;
  impressora_online: boolean;
  ultima_sincronizacao: string | null;
  ultima_sincronizacao_formatada?: string;
  proxima_sincronizacao: string | null;
  total_produtos: number;
  total_produtos_ativos?: number;
  total_produtos_inativos?: number;
  agente_online?: boolean;
  agente_ultima_comunicacao?: string | null;
  status_sincronizacao_nuvem?: 'SINCRONIZADO' | 'AGUARDANDO' | 'ERRO';
  loja_atual: number;
  tempo_retorno_segundos: number;
}

export interface SyncVerificationData {
  success: boolean;
  is_synced: boolean;
  status: 'SINCRONIZADO' | 'AGUARDANDO' | 'ERRO';
  status_mensagem: string;
  ultima_sincronizacao: string | null;
  ultima_sincronizacao_formatada: string;
  tempo_relativo: string;
  proxima_sincronizacao: string | null;
  proxima_sincronizacao_formatada: string;
  id_loja: number;
  nome_loja: string;
  total_produtos_nuvem: number;
  total_produtos_ativos: number;
  total_produtos_inativos: number;
  agente: {
    online: boolean;
    ultima_comunicacao: string | null;
    ultima_comunicacao_formatada: string;
    host_local: string;
    banco: string;
    loja: number;
    ultimo_status: string;
    erros_recentes: string;
  };
  ultimos_produtos_sincronizados: Array<{
    codigo_interno: string;
    codigo_barras: string;
    descricao: string;
    preco: number;
    embalagem: string;
    ativo: boolean;
    ultima_sincronizacao: string;
    ultima_sincronizacao_formatada: string;
  }>;
  historico_recente: SyncLog[];
}
