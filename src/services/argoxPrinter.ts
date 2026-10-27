import { LabelElement, LabelModel, PrinterConfig, PrintJobProduct } from '../types';

export const MM_TO_DOTS_203DPI = 8.0; // 203 DPI / 25.4 mm = 7.992 dots/mm ≈ 8.0

export function mmToDots(mm: number, dpi: number = 203): number {
  return Math.round(mm * (dpi / 25.4));
}

export function dotsToMm(dots: number, dpi: number = 203): number {
  return Number((dots / (dpi / 25.4)).toFixed(2));
}

export function formatPrice(preco: number): { full: string; cifrao: string; reais: string; centavos: string } {
  const formatted = Number(preco || 0).toFixed(2);
  const [reais, centavos] = formatted.split('.');
  return {
    full: `R$ ${reais},${centavos}`,
    cifrao: 'R$',
    reais,
    centavos: `,${centavos}`,
  };
}

/**
 * Resolves text content for a label element based on the printed product(s)
 */
export function resolveElementText(
  el: LabelElement,
  products: PrintJobProduct[]
): string {
  const pIndex = el.slot === 2 ? 1 : 0;
  const p = products[pIndex] || {
    codigo_interno: '0000',
    codigo_barras: '7891000000000',
    descricao: el.slot === 2 ? 'PRODUTO 2 EXEMPLO' : 'PRODUTO 1 EXEMPLO',
    preco: el.slot === 2 ? 6.99 : 4.48,
    embalagem: 'UN',
    ncm: '00000000',
  };

  const priceObj = formatPrice(p.preco);

  switch (el.tipo) {
    case 'descricao':
      return p.descricao;
    case 'preco_completo':
      return priceObj.full;
    case 'cifrao':
      return 'R$';
    case 'preco_reais':
      return priceObj.reais;
    case 'preco_centavos':
      return priceObj.centavos;
    case 'codigo_barras':
    case 'ean_texto':
      return p.codigo_barras;
    case 'codigo_interno':
      return `Cód: ${p.codigo_interno}`;
    case 'embalagem':
      return p.embalagem || 'UN';
    case 'ncm':
      return p.ncm ? `NCM: ${p.ncm}` : '';
    case 'texto_fixo':
      return el.texto_personalizado || '';
    default:
      return '';
  }
}

/**
 * Generates Argox PPLB (Eltron/EPL2 compatible) command sequence
 */
export function generateArgoxPPLB(
  model: LabelModel,
  printer: PrinterConfig,
  products: PrintJobProduct[]
): string {
  const dpi = printer.dpi || 203;
  const offsetX = printer.offset_x || 0;
  const offsetY = printer.offset_y || 0;

  const widthDots = mmToDots(model.largura_mm + (printer.largura_calibrada || 0), dpi);
  const heightDots = mmToDots(model.altura_mm + (printer.altura_calibrada || 0), dpi);
  const gapDots = mmToDots(model.gap || printer.gap || 3, dpi);

  const lines: string[] = [];

  // Reset / Clear image buffer
  lines.push('N');
  // Darkness / Temperature (0-15)
  if (model.temperatura !== undefined) {
    lines.push(`D${Math.min(15, Math.max(0, model.temperatura))}`);
  }
  // Print speed (2, 3, 4 inches/sec)
  if (model.velocidade) {
    lines.push(`S${model.velocidade}`);
  }
  // Set label width and length
  lines.push(`q${widthDots}`);
  lines.push(`Q${heightDots},${gapDots}`);

  // Process elements
  for (const el of model.elementos) {
    if (!el.visivel) continue;

    const posX = mmToDots(el.x + offsetX, dpi);
    const posY = mmToDots(el.y + offsetY, dpi);
    const wDots = mmToDots(el.largura, dpi);
    const hDots = mmToDots(el.altura, dpi);

    const text = resolveElementText(el, products);

    if (el.tipo === 'codigo_barras') {
      // Barcode command Bp1,p2,p3,p4,p5,p6,p7,p8,"DATA"
      // p1=x, p2=y, p3=rot (0=normal), p4=type (E30=EAN13, 1=Code128), p5=narrow, p6=wide, p7=height, p8=human readable (B=yes, N=no)
      const cleanCode = text.replace(/\D/g, '');
      const isEan13 = cleanCode.length === 13;
      const bcType = isEan13 ? 'E30' : '1';
      lines.push(`B${posX},${posY},0,${bcType},2,4,${Math.max(20, hDots)},B,"${cleanCode || text}"`);
    } else if (el.tipo === 'linha_horizontal' || el.tipo === 'separador') {
      // Line: LOx,y,width,height
      lines.push(`LO${posX},${posY},${wDots},${Math.max(2, hDots)}`);
    } else if (el.tipo === 'linha_vertical') {
      lines.push(`LO${posX},${posY},${Math.max(2, wDots)},${hDots}`);
    } else if (el.tipo === 'retangulo') {
      // Box: Xx,y,thickness,x_end,y_end
      lines.push(`X${posX},${posY},2,${posX + wDots},${posY + hDots}`);
    } else {
      // Text command: Ap1,p2,p3,p4,p5,p6,p7,"DATA"
      // p4: font 1..5, p5: h-mult (1..8), p6: v-mult (1..9)
      let font = '3';
      let hMult = 1;
      let vMult = 1;

      if (el.tipo === 'preco_reais') {
        font = '4';
        hMult = 2;
        vMult = 3;
      } else if (el.tipo === 'preco_completo') {
        font = '4';
        hMult = 2;
        vMult = 2;
      } else if (el.tamanho_fonte > 20) {
        font = '4';
        hMult = 2;
        vMult = 2;
      } else if (el.tamanho_fonte < 10) {
        font = '2';
      }

      const sanitizedText = text.replace(/"/g, '\\"');
      lines.push(`A${posX},${posY},0,${font},${hMult},${vMult},N,"${sanitizedText}"`);
    }
  }

  // Print 1 label
  lines.push('P1');
  return lines.join('\n');
}

/**
 * Generates Argox PPLA (Datamax compatible) command sequence
 */
export function generateArgoxPPLA(
  model: LabelModel,
  printer: PrinterConfig,
  products: PrintJobProduct[]
): string {
  const dpi = printer.dpi || 203;
  const offsetX = printer.offset_x || 0;
  const offsetY = printer.offset_y || 0;

  const lines: string[] = [];
  // STX L
  lines.push('\x02L');
  // Density
  lines.push('D11');
  // Darkness
  if (model.temperatura !== undefined) {
    lines.push(`H${model.temperatura}`);
  }

  for (const el of model.elementos) {
    if (!el.visivel) continue;

    const posX = String(mmToDots(el.x + offsetX, dpi)).padStart(4, '0');
    const posY = String(mmToDots(el.y + offsetY, dpi)).padStart(4, '0');
    const text = resolveElementText(el, products);

    if (el.tipo === 'codigo_barras') {
      const cleanCode = text.replace(/\D/g, '');
      // 1e00000posYposXDATA (EAN-13 in PPLA)
      lines.push(`1e00000${posY}${posX}${cleanCode}`);
    } else if (el.tipo === 'linha_horizontal' || el.tipo === 'separador') {
      const wDots = String(mmToDots(el.largura, dpi)).padStart(4, '0');
      lines.push(`1X11000${posY}${posX}L${wDots}002`);
    } else {
      let font = '2';
      if (el.tipo === 'preco_reais' || el.tamanho_fonte > 22) font = '4';
      lines.push(`1${font}11000${posY}${posX}${text}`);
    }
  }

  lines.push('Q0001');
  lines.push('E');
  return lines.join('\r\n');
}

/**
 * Default Label Models for Supermarkets
 */
export const DEFAULT_LABEL_MODELS: LabelModel[] = [
  {
    id: 'gondola-dupla-100x30',
    nome: 'GÔNDOLA DUPLA (100 × 30 mm · 2 Produtos)',
    largura_mm: 100,
    altura_mm: 30,
    orientacao: 'paisagem',
    produtos_por_etiqueta: 2,
    margem_esquerda: 1,
    margem_direita: 1,
    margem_superior: 1,
    margem_inferior: 1,
    gap: 3,
    velocidade: 3,
    temperatura: 10,
    padrao: true,
    ativo: true,
    elementos: [
      // PRODUTO 1 (Left 0..48mm)
      {
        id: 'p1_desc',
        tipo: 'descricao',
        slot: 1,
        x: 2,
        y: 2,
        largura: 45,
        altura: 7,
        fonte: 'Arial',
        tamanho_fonte: 11,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: true,
        max_linhas: 2,
        visivel: true,
      },
      {
        id: 'p1_emb',
        tipo: 'embalagem',
        slot: 1,
        x: 2,
        y: 9.5,
        largura: 20,
        altura: 3.5,
        fonte: 'Arial',
        tamanho_fonte: 8.5,
        negrito: false,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cifrao',
        tipo: 'cifrao',
        slot: 1,
        x: 2,
        y: 15.5,
        largura: 6,
        altura: 5,
        fonte: 'Arial',
        tamanho_fonte: 11,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_reais',
        tipo: 'preco_reais',
        slot: 1,
        x: 8.5,
        y: 13,
        largura: 16,
        altura: 10,
        fonte: 'Arial Black',
        tamanho_fonte: 24,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cents',
        tipo: 'preco_centavos',
        slot: 1,
        x: 25,
        y: 13,
        largura: 8,
        altura: 6,
        fonte: 'Arial Black',
        tamanho_fonte: 14,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_barras',
        tipo: 'codigo_barras',
        slot: 1,
        x: 2,
        y: 22,
        largura: 28,
        altura: 6.5,
        fonte: 'Monospace',
        tamanho_fonte: 8,
        negrito: false,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cod_int',
        tipo: 'codigo_interno',
        slot: 1,
        x: 31,
        y: 24.5,
        largura: 16,
        altura: 4,
        fonte: 'Arial',
        tamanho_fonte: 8,
        negrito: true,
        alinhamento: 'right',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },

      // SEPARADOR CENTRAL
      {
        id: 'div_sep',
        tipo: 'separador',
        slot: 1,
        x: 49.5,
        y: 1.5,
        largura: 0.4,
        altura: 27,
        fonte: 'Arial',
        tamanho_fonte: 10,
        negrito: false,
        alinhamento: 'center',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },

      // PRODUTO 2 (Right 51..100mm)
      {
        id: 'p2_desc',
        tipo: 'descricao',
        slot: 2,
        x: 52,
        y: 2,
        largura: 45,
        altura: 7,
        fonte: 'Arial',
        tamanho_fonte: 11,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: true,
        max_linhas: 2,
        visivel: true,
      },
      {
        id: 'p2_emb',
        tipo: 'embalagem',
        slot: 2,
        x: 52,
        y: 9.5,
        largura: 20,
        altura: 3.5,
        fonte: 'Arial',
        tamanho_fonte: 8.5,
        negrito: false,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p2_cifrao',
        tipo: 'cifrao',
        slot: 2,
        x: 52,
        y: 15.5,
        largura: 6,
        altura: 5,
        fonte: 'Arial',
        tamanho_fonte: 11,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p2_reais',
        tipo: 'preco_reais',
        slot: 2,
        x: 58.5,
        y: 13,
        largura: 16,
        altura: 10,
        fonte: 'Arial Black',
        tamanho_fonte: 24,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p2_cents',
        tipo: 'preco_centavos',
        slot: 2,
        x: 75,
        y: 13,
        largura: 8,
        altura: 6,
        fonte: 'Arial Black',
        tamanho_fonte: 14,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p2_barras',
        tipo: 'codigo_barras',
        slot: 2,
        x: 52,
        y: 22,
        largura: 28,
        altura: 6.5,
        fonte: 'Monospace',
        tamanho_fonte: 8,
        negrito: false,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p2_cod_int',
        tipo: 'codigo_interno',
        slot: 2,
        x: 81,
        y: 24.5,
        largura: 16,
        altura: 4,
        fonte: 'Arial',
        tamanho_fonte: 8,
        negrito: true,
        alinhamento: 'right',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
    ],
  },
  {
    id: 'gondola-padrao-100x30',
    nome: 'GÔNDOLA PADRÃO (100 × 30 mm · 1 Produto)',
    largura_mm: 100,
    altura_mm: 30,
    orientacao: 'paisagem',
    produtos_por_etiqueta: 1,
    margem_esquerda: 1,
    margem_direita: 1,
    margem_superior: 1,
    margem_inferior: 1,
    gap: 3,
    velocidade: 3,
    temperatura: 10,
    padrao: false,
    ativo: true,
    elementos: [
      {
        id: 'p1_desc',
        tipo: 'descricao',
        slot: 1,
        x: 3,
        y: 2,
        largura: 56,
        altura: 9,
        fonte: 'Arial',
        tamanho_fonte: 13,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: true,
        max_linhas: 2,
        visivel: true,
      },
      {
        id: 'p1_emb',
        tipo: 'embalagem',
        slot: 1,
        x: 3,
        y: 11.5,
        largura: 22,
        altura: 4,
        fonte: 'Arial',
        tamanho_fonte: 9,
        negrito: false,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cod_int',
        tipo: 'codigo_interno',
        slot: 1,
        x: 26,
        y: 11.5,
        largura: 24,
        altura: 4,
        fonte: 'Arial',
        tamanho_fonte: 9,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_barras',
        tipo: 'codigo_barras',
        slot: 1,
        x: 3,
        y: 17,
        largura: 48,
        altura: 11,
        fonte: 'Monospace',
        tamanho_fonte: 9,
        negrito: false,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cifrao',
        tipo: 'cifrao',
        slot: 1,
        x: 60,
        y: 10,
        largura: 8,
        altura: 6,
        fonte: 'Arial Black',
        tamanho_fonte: 14,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_reais',
        tipo: 'preco_reais',
        slot: 1,
        x: 68,
        y: 3.5,
        largura: 20,
        altura: 15,
        fonte: 'Arial Black',
        tamanho_fonte: 34,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cents',
        tipo: 'preco_centavos',
        slot: 1,
        x: 88,
        y: 4.5,
        largura: 10,
        altura: 8,
        fonte: 'Arial Black',
        tamanho_fonte: 18,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
    ],
  },
  {
    id: 'gondola-oferta-100x30',
    nome: 'GÔNDOLA OFERTA / DESTAQUE (100 × 30 mm · 1 Produto)',
    largura_mm: 100,
    altura_mm: 30,
    orientacao: 'paisagem',
    produtos_por_etiqueta: 1,
    margem_esquerda: 1,
    margem_direita: 1,
    margem_superior: 1,
    margem_inferior: 1,
    gap: 3,
    velocidade: 3,
    temperatura: 12,
    padrao: false,
    ativo: true,
    elementos: [
      {
        id: 'title_super',
        tipo: 'texto_fixo',
        texto_personalizado: 'OFERTA ESPECIAL',
        slot: 1,
        x: 3,
        y: 1.5,
        largura: 48,
        altura: 4.5,
        fonte: 'Arial Black',
        tamanho_fonte: 10,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_desc',
        tipo: 'descricao',
        slot: 1,
        x: 3,
        y: 6.5,
        largura: 56,
        altura: 8.5,
        fonte: 'Arial',
        tamanho_fonte: 12,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: true,
        max_linhas: 2,
        visivel: true,
      },
      {
        id: 'p1_barras',
        tipo: 'codigo_barras',
        slot: 1,
        x: 3,
        y: 17,
        largura: 44,
        altura: 11,
        fonte: 'Monospace',
        tamanho_fonte: 8.5,
        negrito: false,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cod_int',
        tipo: 'codigo_interno',
        slot: 1,
        x: 48,
        y: 20,
        largura: 16,
        altura: 5,
        fonte: 'Arial',
        tamanho_fonte: 8.5,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cifrao',
        tipo: 'cifrao',
        slot: 1,
        x: 61,
        y: 9.5,
        largura: 8,
        altura: 7,
        fonte: 'Arial Black',
        tamanho_fonte: 15,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_reais',
        tipo: 'preco_reais',
        slot: 1,
        x: 69,
        y: 2.5,
        largura: 21,
        altura: 16,
        fonte: 'Arial Black',
        tamanho_fonte: 38,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
      {
        id: 'p1_cents',
        tipo: 'preco_centavos',
        slot: 1,
        x: 90,
        y: 3.5,
        largura: 9,
        altura: 8,
        fonte: 'Arial Black',
        tamanho_fonte: 19,
        negrito: true,
        alinhamento: 'left',
        rotacao: 0,
        quebra_linha: false,
        max_linhas: 1,
        visivel: true,
      },
    ],
  },
];
