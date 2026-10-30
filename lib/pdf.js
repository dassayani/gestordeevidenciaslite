// Documento em PDF nos 3 modelos: Passo a passo, Ficha de evidência e
// Relatório QA. Medidas em milímetros, página A4.
//
// Os modelos são escritos com a semântica de célula do fpdf (margem interna,
// linha de base do texto, quebra de linha), que o jsPDF não tem. A classe
// Fpdf abaixo dá essa semântica por cima do jsPDF.
//
// Precisa do jsPDF carregado antes (lib/vendor/jspdf.umd.min.js, global).

const PAGE_W = 210.0;
const PAGE_H = 297.0;
const LINHAS_LEGENDA_FICHA = 4;
const MARGEM = 20.0;
const MARGEM_PASSO = 10.0;
const LARGURA_LATERAL_QA = 55.0;
const X0_QA = LARGURA_LATERAL_QA + 14;
const TEXTO = [23, 38, 46];
const MUTED = [107, 129, 144];
const MUTED_CLARO = [142, 162, 173];

const PT_MM = 25.4 / 72;

// A fonte padrão do PDF só tem latin-1. Travessão,
// aspas curvas e reticências (que o Word e o Teams põem sozinhos) viram o
// equivalente; o resto fora do latin-1 é decomposto e, se não couber, sai.
const EQUIVALENTES = {
  "—": "-", "–": "-", "−": "-",
  "‘": "'", "’": "'", "‚": "'",
  "“": '"', "”": '"', "„": '"',
  "…": "...",
  " ": " ", " ": " ", " ": " ",
  "•": "-",
  "→": "->", "←": "<-",
  "✓": "v", "✔": "v", "✗": "x", "✘": "x",
};
const cabeLatin1 = (c) => c.codePointAt(0) <= 0xff;

export function textoSeguro(valor) {
  if (valor == null) return "";
  let texto = String(valor);
  for (const [origem, destino] of Object.entries(EQUIVALENTES)) texto = texto.split(origem).join(destino);
  if ([...texto].every(cabeLatin1)) return texto;
  return [...texto.normalize("NFKD")].filter(cabeLatin1).join("");
}

const hexRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
const escurecer = (rgb, fator = 0.42) => rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * fator))));
const clarear = (rgb, fator) => rgb.map((c) => Math.round(c + (255 - c) * Math.max(0, Math.min(1, fator))));

// ---------------------------------------------------------------- Fpdf
class Fpdf {
  constructor() {
    this.doc = new globalThis.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    this.paginas = 0;
    this.x = 10;
    this.y = 10;
    this.lMargin = 10; // margem padrão do fpdf: 10 mm
    this.rMargin = 10;
    this.cMargin = 1; // margem interna da célula: margem / 10
    this.tamanho = 12;
  }

  addPage() {
    // o jsPDF já nasce com a primeira página
    if (this.paginas++) this.doc.addPage("a4");
    this.doc.setLineWidth(0.2);
    this.x = this.lMargin;
    this.y = 10;
  }

  pageNo() {
    return this.paginas;
  }

  setXY(x, y) {
    this.x = x;
    this.y = y;
  }

  getY() {
    return this.y;
  }

  setFont(estilo, tamanho) {
    this.doc.setFont("helvetica", estilo === "B" ? "bold" : "normal");
    this.doc.setFontSize(tamanho);
    this.tamanho = tamanho;
  }

  setTextColor(rgb) { this.doc.setTextColor(...rgb); }
  setFillColor(rgb) { this.doc.setFillColor(...rgb); }
  setDrawColor(rgb) { this.doc.setDrawColor(...rgb); }
  setLineWidth(w) { this.doc.setLineWidth(w); }

  largura(texto) {
    return this.doc.getTextWidth(textoSeguro(texto));
  }

  rect(x, y, w, h, estilo = "") {
    this.doc.rect(x, y, w, h, estilo === "F" ? "F" : "S");
  }

  line(x1, y1, x2, y2) {
    this.doc.line(x1, y1, x2, y2);
  }

  ellipse(x, y, w, h) {
    this.doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, "F");
  }

  // texto com a linha de base em y, como o text() do fpdf
  text(x, y, texto) {
    this.doc.text(textoSeguro(texto), x, y, { baseline: "alphabetic" });
  }

  // cell do fpdf: texto a cMargin da borda, centrado na altura pela conta
  // dele (0,5 h + 0,3 do tamanho da fonte); w = 0 vai até a margem direita
  cell(w, h, texto = "", align = "L") {
    if (w === 0) w = PAGE_W - this.rMargin - this.x;
    const t = textoSeguro(texto);
    if (t) {
      const sw = this.doc.getTextWidth(t);
      const dx = align === "R" ? w - this.cMargin - sw : align === "C" ? (w - sw) / 2 : this.cMargin;
      this.doc.text(t, this.x + dx, this.y + 0.5 * h + 0.3 * this.tamanho * PT_MM, { baseline: "alphabetic" });
    }
    this.x += w;
  }

  // multi_cell do fpdf: quebra na largura útil (w - 2 cMargin), uma célula
  // por linha, e no fim volta x para a margem esquerda
  multiCell(w, h, texto, align = "L") {
    if (w === 0) w = PAGE_W - this.rMargin - this.x;
    const x = this.x;
    let t = textoSeguro(texto).replace(/\r/g, "");
    if (t.endsWith("\n")) t = t.slice(0, -1);
    for (const linha of quebrarFpdf(this, t, w - 2 * this.cMargin)) {
      this.x = x;
      this.cell(w, h, linha, align);
      this.y += h;
    }
    this.x = this.lMargin;
  }

  image(img, x, y, w, h) {
    this.doc.addImage(img.dados, img.formato, x, y, w, h, undefined, "FAST");
  }
}

// Quebra como o multi_cell do fpdf: no último espaço que cabe; palavra maior
// que a linha é partida no meio.
function quebrarFpdf(pdf, texto, largura) {
  const linhas = [];
  for (const paragrafo of texto.split("\n")) {
    let atual = "";
    let i = 0;
    let ultimoEspaco = -1;
    const chars = [...paragrafo];
    let inicio = 0;
    while (i < chars.length) {
      if (chars[i] === " ") ultimoEspaco = i;
      const pedaco = chars.slice(inicio, i + 1).join("");
      if (pdf.doc.getTextWidth(pedaco) > largura) {
        if (ultimoEspaco >= inicio) {
          linhas.push(chars.slice(inicio, ultimoEspaco).join(""));
          inicio = ultimoEspaco + 1;
        } else {
          linhas.push(chars.slice(inicio, Math.max(inicio + 1, i)).join(""));
          inicio = Math.max(inicio + 1, i);
        }
        ultimoEspaco = -1;
        i = inicio;
        continue;
      }
      i++;
    }
    atual = chars.slice(inicio).join("");
    linhas.push(atual);
  }
  return linhas;
}

// A quebra da legenda da Ficha, que precisa
// saber quantas linhas gasta antes de desenhar.
function cabeAte(pdf, texto, largura) {
  let corte = 1;
  while (corte < texto.length && pdf.largura(texto.slice(0, corte + 1)) <= largura) corte++;
  return corte;
}

function quebrar(pdf, texto, largura) {
  const linhas = [];
  for (const paragrafo of textoSeguro(texto).split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const teste = `${atual} ${palavra}`.trim();
      if (atual && pdf.largura(teste) > largura) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = teste;
      }
      while (pdf.largura(atual) > largura) {
        const corte = cabeAte(pdf, atual, largura);
        linhas.push(atual.slice(0, corte));
        atual = atual.slice(corte);
      }
    }
    linhas.push(atual);
  }
  return linhas.length ? linhas : [""];
}

function legendaLimitada(pdf, texto, largura, alturaLinha, maxLinhas) {
  let linhas = quebrar(pdf, texto, largura);
  if (linhas.length > maxLinhas) {
    linhas = linhas.slice(0, maxLinhas);
    linhas[linhas.length - 1] = linhas[linhas.length - 1].trimEnd() + "...";
  }
  const { x, y } = pdf;
  linhas.forEach((linha, i) => {
    pdf.setXY(x, y + i * alturaLinha);
    pdf.cell(largura, alturaLinha, linha);
  });
  return y + linhas.length * alturaLinha;
}

function circuloNumerado(pdf, cx, cy, r, texto, tamanhoPt, corFundo) {
  pdf.setFillColor(corFundo);
  pdf.ellipse(cx - r, cy - r, r * 2, r * 2);
  pdf.setFont("B", tamanhoPt);
  pdf.setTextColor([255, 255, 255]);
  const larguraTxt = pdf.largura(texto);
  const alturaTxt = tamanhoPt * 0.3528;
  pdf.text(cx - larguraTxt / 2, cy + alturaTxt * 0.32, texto);
}

// Imagem centrada na caixa, sem distorcer
function imagemAjustada(pdf, img, x, y, w, h, borda, corBorda) {
  const escala = Math.min(w / img.largura, h / img.altura);
  const dw = img.largura * escala;
  const dh = img.altura * escala;
  pdf.image(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  if (borda) {
    pdf.setDrawColor(corBorda);
    pdf.setLineWidth(0.5);
    pdf.rect(x, y, w, h);
  }
}

const totalPaginas = (passos) => Math.max(1, Math.ceil(passos.length / 2));

// ---------------------------------------------------------------- 1f
function passoAPasso(pdf, c, passos, o) {
  const cor = hexRgb(o.corDestaque);
  const m = MARGEM_PASSO;
  const total = totalPaginas(passos);
  let pagina = 0;
  for (let idx = 0; idx < Math.max(1, passos.length); idx += 2) {
    pagina++;
    pdf.addPage();
    pdf.setFillColor(cor);
    pdf.rect(0, 0, PAGE_W, 3, "F");

    let y;
    if (idx === 0) {
      pdf.setXY(m, 12);
      pdf.setFont("", 9);
      pdf.setTextColor(cor);
      pdf.cell(0, 5, "MANUAL DE OPERAÇÃO");
      pdf.setXY(m, 18);
      pdf.setFont("B", 18);
      pdf.setTextColor(TEXTO);
      pdf.cell(120, 9, c.titulo);
      pdf.setXY(130, 12);
      pdf.setFont("", 9);
      pdf.setTextColor(MUTED);
      const meta = [c.caso, c.ambiente, c.autor, c.data].filter(Boolean);
      pdf.multiCell(PAGE_W - m - 130, 5, meta.join("\n"), "R");
      const yDivisoria = Math.max(30, pdf.getY() + 2);
      pdf.setDrawColor([220, 226, 230]);
      pdf.line(m, yDivisoria, PAGE_W - m, yDivisoria);
      y = yDivisoria + 6;
    } else {
      y = 14;
    }

    for (const j of [idx, idx + 1]) {
      if (j >= passos.length) break;
      const passo = passos[j];
      const r = 4.5;
      let textoX;
      let fimNumero;
      if (o.numerarPassos) {
        circuloNumerado(pdf, m + r, y + r, r, String(j + 1), 10, cor);
        textoX = m + r * 2 + 4;
        fimNumero = y + r * 2;
      } else {
        textoX = m;
        fimNumero = y;
      }
      pdf.setXY(textoX, y);
      pdf.setFont("B", 12);
      pdf.setTextColor(TEXTO);
      pdf.multiCell(PAGE_W - m - textoX, 6, passo.legenda, "L");
      y = Math.max(pdf.getY(), fimNumero) + 5;
      const imgH = 82;
      imagemAjustada(pdf, passo.imagem, m, y, PAGE_W - 2 * m, imgH, o.bordaAtivada, hexRgb(o.bordaCor));
      y += imgH + 9;
    }

    pdf.setXY(m, PAGE_H - 14);
    pdf.setFont("", 8);
    pdf.setTextColor(MUTED_CLARO);
    pdf.cell(120, 5, "Gestor de Evidências");
    pdf.setXY(PAGE_W - m - 40, PAGE_H - 14);
    pdf.cell(40, 5, `Página ${pagina} de ${total}`, "R");
  }
}

// ---------------------------------------------------------------- 1g
function fichaEvidencia(pdf, c, passos, o) {
  const cor = hexRgb(o.corDestaque);
  const total = totalPaginas(passos);
  let pagina = 0;
  for (let idx = 0; idx < Math.max(1, passos.length); idx += 2) {
    pagina++;
    pdf.addPage();
    pdf.setFillColor(cor);
    pdf.rect(0, 0, PAGE_W, 32, "F");
    pdf.setXY(MARGEM, 10);
    pdf.setFont("", 8);
    pdf.setTextColor([230, 240, 242]);
    pdf.cell(0, 5, "REGISTRO DE EVIDÊNCIAS");
    pdf.setXY(MARGEM, 16);
    pdf.setFont("B", 15);
    pdf.setTextColor([255, 255, 255]);
    pdf.cell(130, 8, c.titulo + (c.caso ? ` · ${c.caso}` : ""));
    pdf.setXY(140, 10);
    pdf.setFont("", 8);
    pdf.setTextColor([207, 232, 238]);
    pdf.multiCell(50, 4.5, `${c.ambiente}\n${c.data}\n${c.autor}`, "R");

    let y = 40;
    for (const j of [idx, idx + 1]) {
      if (j >= passos.length) break;
      const passo = passos[j];
      const alturaCard = 118;
      pdf.setDrawColor([225, 232, 238]);
      pdf.setLineWidth(0.3);
      pdf.rect(MARGEM, y, PAGE_W - 2 * MARGEM, alturaCard);

      pdf.setFillColor([230, 242, 245]);
      pdf.rect(MARGEM + 4, y + 4, 16, 7, "F");
      pdf.setXY(MARGEM + 4, y + 5.3);
      pdf.setFont("B", 8);
      pdf.setTextColor(cor);
      pdf.cell(16, 5, `EV-${String(j + 1).padStart(2, "0")}`, "C");

      pdf.setXY(MARGEM + 24, y + 4);
      pdf.setFont("B", 11);
      pdf.setTextColor(TEXTO);
      const fimLegenda = legendaLimitada(
        pdf, passo.legenda, PAGE_W - 2 * MARGEM - 28, 5.5, LINHAS_LEGENDA_FICHA);

      const imgY = Math.max(y + 24, fimLegenda + 2);
      const imgH = (y + alturaCard - 8) - imgY;
      imagemAjustada(pdf, passo.imagem, MARGEM + 4, imgY, PAGE_W - 2 * MARGEM - 8, imgH,
        o.bordaAtivada, hexRgb(o.bordaCor));
      y += alturaCard + 8;
    }

    pdf.setXY(MARGEM, PAGE_H - 14);
    pdf.setFont("", 8);
    pdf.setTextColor(MUTED_CLARO);
    pdf.cell(140, 5, "Gestor de Evidências");
    pdf.setXY(PAGE_W - MARGEM - 40, PAGE_H - 14);
    pdf.cell(40, 5, `Página ${pagina} de ${total}`, "R");
  }
}

// ---------------------------------------------------------------- 1h
function relatorioQa(pdf, c, passos, o) {
  const cor = hexRgb(o.corDestaque);
  const total = totalPaginas(passos);
  const lateral = LARGURA_LATERAL_QA;
  const faixa = escurecer(cor);
  const faixaTexto = clarear(faixa, 0.72);
  const faixaRotulo = clarear(faixa, 0.58);
  const faixaLinha = clarear(faixa, 0.22);
  let pagina = 0;
  for (let idx = 0; idx < Math.max(1, passos.length); idx += 2) {
    pagina++;
    pdf.addPage();

    pdf.setFillColor(faixa);
    pdf.rect(0, 0, lateral, PAGE_H, "F");
    pdf.setXY(8, 14);
    pdf.setFont("B", 13);
    pdf.setTextColor([255, 255, 255]);
    pdf.multiCell(lateral - 16, 6, "Relatório de teste", "L");
    pdf.setXY(8, 28);
    pdf.setFont("", 8);
    pdf.setTextColor(faixaTexto);
    pdf.multiCell(lateral - 16, 4.2, [c.titulo, c.caso, c.ambiente].filter(Boolean).join("\n"), "L");

    pdf.setDrawColor(faixaLinha);
    pdf.line(8, 46, lateral - 8, 46);

    pdf.setXY(8, 52);
    pdf.setFont("", 7.5);
    pdf.setTextColor(faixaRotulo);
    pdf.cell(0, 4, "RESUMO");
    pdf.setXY(8, 58);
    pdf.setFont("B", 18);
    pdf.setTextColor([255, 255, 255]);
    pdf.cell(0, 8, String(passos.length));
    pdf.setXY(8, 66);
    pdf.setFont("", 7.5);
    pdf.setTextColor(faixaTexto);
    pdf.cell(0, 4, "capturas neste relatório");

    pdf.setXY(8, PAGE_H - 30);
    pdf.setFont("", 7);
    pdf.setTextColor(faixaRotulo);
    pdf.multiCell(lateral - 16, 4, `${c.autor}\n${c.data}`, "L");

    const x0 = X0_QA;
    let y = 16;
    pdf.setXY(x0, y);
    pdf.setFont("", 8);
    pdf.setTextColor(cor);
    pdf.cell(0, 5, "EVIDÊNCIAS");
    y += 10;

    for (const j of [idx, idx + 1]) {
      if (j >= passos.length) break;
      const passo = passos[j];
      const alturaNumero = 6;
      pdf.setXY(x0, y);
      pdf.setFont("B", 11);
      pdf.setTextColor(cor);
      pdf.cell(10, alturaNumero, String(j + 1));
      pdf.setXY(x0 + 10, y);
      pdf.setFont("B", 10.5);
      pdf.setTextColor(TEXTO);
      pdf.multiCell(PAGE_W - MARGEM - x0 - 10, 5, passo.legenda, "L");
      y = Math.max(pdf.getY(), y + alturaNumero) + 5;
      const imgH = 78;
      imagemAjustada(pdf, passo.imagem, x0, y, PAGE_W - MARGEM - x0, imgH, o.bordaAtivada, hexRgb(o.bordaCor));
      y += imgH + 10;
    }

    pdf.setXY(x0, PAGE_H - 14);
    pdf.setFont("", 8);
    pdf.setTextColor(MUTED_CLARO);
    pdf.cell(100, 5, "Gestor de Evidências");
    pdf.setXY(PAGE_W - MARGEM - 30, PAGE_H - 14);
    pdf.cell(30, 5, `${pagina} / ${total}`, "R");
  }
}

export const MODELOS = {
  passo: { nome: "Passo a passo", desenhar: passoAPasso },
  ficha: { nome: "Ficha de evidência", desenhar: fichaEvidencia },
  qa: { nome: "Relatório QA", desenhar: relatorioQa },
};

// ---------------------------------------------------------------- imagens
// Padronização combinada para o PDF não pesar: lado maior até 1600 px, em
// PNG (texto de tela nítido); se ainda passar de 600 KB, JPEG 90%.
const LADO_MAXIMO = 1600;
const TETO_PNG = 600 * 1024;

export async function prepararImagem(blob) {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext("2d");
  // fundo branco: o JPEG não tem transparência, e o PNG fica igual no papel
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  let saida = await tela.convertToBlob({ type: "image/png" });
  let formato = "PNG";
  if (saida.size > TETO_PNG) {
    saida = await tela.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    formato = "JPEG";
  }
  return { dados: new Uint8Array(await saida.arrayBuffer()), formato, largura, altura };
}

// ---------------------------------------------------------------- gerar
// `passos`: [{ imagem: Blob, legenda }], na ordem do documento. Legenda vazia
// sai em branco,
// ocupando a mesma linha, para a imagem não subir.
// `capa`: { titulo, caso, autor, data, ambiente }. Devolve um Blob PDF.
export async function gerarPdf(modelo, capa, passos, opcoes = {}) {
  const o = {
    corDestaque: "#0B7285",
    numerarPassos: true,
    bordaAtivada: false,
    bordaCor: "#0B7285",
    ...opcoes,
  };
  const c = {
    titulo: capa.titulo || "Evidências de teste",
    caso: capa.caso || "",
    autor: capa.autor || "",
    data: capa.data || "",
    ambiente: capa.ambiente || "",
  };
  const preparados = [];
  for (const p of passos) preparados.push({ legenda: p.legenda, imagem: await prepararImagem(p.imagem) });
  const pdf = new Fpdf();
  (MODELOS[modelo] || MODELOS.passo).desenhar(pdf, c, preparados, o);
  pdf.doc.setProperties({ title: c.titulo, author: c.autor, creator: "Gestor de Evidências Lite" });
  return pdf.doc.output("blob");
}
