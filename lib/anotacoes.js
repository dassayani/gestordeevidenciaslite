// Anotações: as formas ficam como dados no .json ("shapes"), e a imagem
// final é sempre redesenhada a partir do original. Assim uma captura pode ser
// reaberta e a edição continua de onde parou.

// Cor fixa da tarja: tarja colorida pareceria destaque, e a função é esconder.
export const COR_TARJA = "rgb(20, 20, 20)";
// Marcas das versões novas da seta e do Borrar; forma sem marca é desenhada
// do jeito antigo.
export const ESTILO = { seta: "afinada", borrao: "desfoque" };
// A primeira é a cor inicial.
export const PALETA = ["#E8590C", "#0B7285", "#0CA678", "#FFC53D", "#17262E"];
export const ESPESSURA_PADRAO = 4;
// O que este editor sabe desenhar. Formas de outras ferramentas que já
// estejam no .json são mantidas, mas não entram no desenho daqui.
export const FERRAMENTAS = ["seta", "borrao", "tarja"];

const ordenado = ([x1, y1, x2, y2]) => [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];

// Seta afinada: corpo que afina da cabeça para a cauda e
// cabeça grande. O canvas já desenha com antialias, sem a superamostragem.
function setaAfinada(ctx, [x1, y1, x2, y2], cor, largura) {
  const larg = Math.max(1, largura) * 1.6;
  const comp = Math.hypot(x2 - x1, y2 - y1);
  if (comp < 1) return;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
  const [px, py] = [-uy, ux];
  const cabeca = Math.min(4.2 * larg, comp * 0.55);
  const meiaCabeca = (3.4 * larg) / 2;
  const [bx, by] = [x2 - ux * cabeca, y2 - uy * cabeca];
  const cauda = (larg * 0.25) / 2;
  const corpo = larg / 2;

  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(x1 + px * cauda, y1 + py * cauda);
  ctx.lineTo(bx + px * corpo, by + py * corpo);
  ctx.lineTo(bx - px * corpo, by - py * corpo);
  ctx.lineTo(x1 - px * cauda, y1 - py * cauda);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x1, y1, cauda, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(bx + px * meiaCabeca, by + py * meiaCabeca);
  ctx.lineTo(bx - px * meiaCabeca, by - py * meiaCabeca);
  ctx.closePath();
  ctx.fill();
}

// A seta antiga (sem "estilo"), de linha reta.
function setaAntiga(ctx, [x1, y1, x2, y2], cor, largura) {
  ctx.strokeStyle = cor;
  ctx.fillStyle = cor;
  ctx.lineWidth = largura;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const comp = 14 + largura * 3;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - comp * Math.cos(ang - 0.5), y2 - comp * Math.sin(ang - 0.5));
  ctx.lineTo(x2 - comp * Math.cos(ang + 0.5), y2 - comp * Math.sin(ang + 0.5));
  ctx.closePath();
  ctx.fill();
}

// Região dentro da imagem, com inteiros; null se pequena demais.
function regiao(tela, coords) {
  let [x1, y1, x2, y2] = ordenado(coords.map(Math.round));
  x1 = Math.max(0, x1);
  y1 = Math.max(0, y1);
  x2 = Math.min(tela.width, x2);
  y2 = Math.min(tela.height, y2);
  return x2 - x1 < 2 || y2 - y1 < 2 ? null : [x1, y1, x2, y2];
}

// Desfoque: duas passadas de gaussiano, com margem em volta para
// a borda do borrão não sair clara.
function desfocar(tela, coords, intensidade) {
  const r = regiao(tela, coords);
  if (!r) return;
  const [x1, y1, x2, y2] = r;
  const raio = 3 + 2 * Math.max(1, Math.trunc(intensidade));
  const margem = raio * 2;
  const [ma, mb] = [Math.max(0, x1 - margem), Math.max(0, y1 - margem)];
  const [mc, md] = [Math.min(tela.width, x2 + margem), Math.min(tela.height, y2 + margem)];
  let atual = new OffscreenCanvas(mc - ma, md - mb);
  atual.getContext("2d").drawImage(tela, ma, mb, mc - ma, md - mb, 0, 0, mc - ma, md - mb);
  for (let i = 0; i < 2; i++) {
    const proxima = new OffscreenCanvas(atual.width, atual.height);
    const c = proxima.getContext("2d");
    // o filtro do canvas completa a borda com transparente; o fundo com a
    // própria imagem evita o halo claro nas bordas da foto
    c.drawImage(atual, 0, 0);
    c.filter = `blur(${raio}px)`;
    c.drawImage(atual, 0, 0);
    atual = proxima;
  }
  tela.getContext("2d").drawImage(atual, x1 - ma, y1 - mb, x2 - x1, y2 - y1, x1, y1, x2 - x1, y2 - y1);
}

// Pixelado: o Borrar antigo (sem "estilo").
function pixelar(tela, coords, bloco = 12) {
  const r = regiao(tela, coords);
  if (!r) return;
  const [x1, y1, x2, y2] = r;
  const [w, h] = [x2 - x1, y2 - y1];
  const pequeno = new OffscreenCanvas(Math.max(1, Math.floor(w / bloco)), Math.max(1, Math.floor(h / bloco)));
  const cp = pequeno.getContext("2d");
  cp.imageSmoothingEnabled = false;
  cp.drawImage(tela, x1, y1, w, h, 0, 0, pequeno.width, pequeno.height);
  const ctx = tela.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pequeno, 0, 0, pequeno.width, pequeno.height, x1, y1, w, h);
  ctx.imageSmoothingEnabled = true;
}

// Desenha uma forma sobre a tela, na ordem em que foi criada: o Borrar borra
// também o que veio antes dele.
export function desenharForma(tela, forma) {
  const ctx = tela.getContext("2d");
  const cor = forma.color || PALETA[0];
  const largura = Math.max(1, Math.trunc(forma.width ?? ESPESSURA_PADRAO));
  if (forma.tool === "seta") {
    (forma.estilo === ESTILO.seta ? setaAfinada : setaAntiga)(ctx, forma.coords, cor, largura);
  } else if (forma.tool === "borrao") {
    if (forma.estilo === ESTILO.borrao) desfocar(tela, forma.coords, largura);
    else pixelar(tela, forma.coords);
  } else if (forma.tool === "tarja") {
    const [x1, y1, x2, y2] = ordenado(forma.coords);
    ctx.fillStyle = COR_TARJA;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }
}

// editor.render_composite: original + formas visíveis.
export function compor(original, formas) {
  const tela = new OffscreenCanvas(original.width, original.height);
  tela.getContext("2d").drawImage(original, 0, 0);
  for (const forma of formas) if (forma.visible !== false) desenharForma(tela, forma);
  return tela;
}
