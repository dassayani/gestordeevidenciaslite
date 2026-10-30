// Edição de uma captura, aberta com dois cliques no popup: seta, borrar,
// tarja e legenda. As formas ficam como dados ("shapes" no .json) e a
// imagem final é redesenhada a partir do original a cada mudança.
import { obterCaptura, atualizarCaptura, excluirCaptura, sincronizar } from "../lib/capturas.js";
import { compor, desenharForma, ESTILO, PALETA, ESPESSURA_PADRAO } from "../lib/anotacoes.js";
import { miniatura } from "../lib/imagem.js";

const id = Number(new URLSearchParams(location.search).get("id"));
const $ = (s) => document.getElementById(s);
const tela = $("tela");
const ctx = tela.getContext("2d");
const legenda = $("legenda");

function erro(texto) {
  $("status").textContent = texto;
  $("status").hidden = false;
}

let original = null; // ImageBitmap da captura sem anotações
let formas = [];
let base = null; // original + formas já concluídas, para não recompor a cada movimento
let desfazer = [];
let mudouImagem = false;
let ferramenta = "seta";
let cor = PALETA[0];

const captura = await obterCaptura(id);
if (!captura) {
  erro("Captura não encontrada. Ela pode ter sido excluída.");
  $("concluir").disabled = true;
} else {
  // `original` só existe depois da primeira edição; antes, a imagem é ela
  original = await createImageBitmap(captura.original || captura.imagem);
  formas = structuredClone(captura.shapes || []);
  tela.width = original.width;
  tela.height = original.height;
  $("quando").textContent = new Date(captura.capturadaEm).toLocaleString("pt-BR");
  legenda.value = captura.caption;
  recompor();
  legenda.focus();
}

function recompor() {
  base = compor(original, formas);
  ctx.drawImage(base, 0, 0);
  $("desfazer").disabled = desfazer.length === 0;
}

// ------------------------------------------------------------ ferramentas
function escolher(nome) {
  ferramenta = nome;
  for (const b of document.querySelectorAll(".ferramenta[data-ferramenta]")) {
    b.setAttribute("aria-pressed", String(b.dataset.ferramenta === nome));
  }
}
for (const b of document.querySelectorAll(".ferramenta[data-ferramenta]")) {
  b.addEventListener("click", () => escolher(b.dataset.ferramenta));
}

for (const c of PALETA) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "cor";
  b.style.background = c;
  b.title = c;
  b.setAttribute("aria-pressed", String(c === cor));
  b.addEventListener("click", () => {
    cor = c;
    for (const x of document.querySelectorAll(".cor")) x.setAttribute("aria-pressed", String(x === b));
  });
  $("cores").append(b);
}

function voltar() {
  if (!desfazer.length) return;
  formas = desfazer.pop();
  mudouImagem = true;
  recompor();
}
$("desfazer").addEventListener("click", voltar);

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    voltar();
    return;
  }
  if (e.target === legenda || e.ctrlKey || e.altKey) return;
  const atalho = { s: "seta", b: "borrao", t: "tarja" }[e.key.toLowerCase()];
  if (atalho) escolher(atalho);
});

// ------------------------------------------------------------ desenho
// coordenadas em pixels da imagem, como ficam gravadas no .json
function ponto(e) {
  const r = tela.getBoundingClientRect();
  return [(e.clientX - r.left) * (tela.width / r.width), (e.clientY - r.top) * (tela.height / r.height)];
}

let emAndamento = null;

tela.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !original) return;
  tela.setPointerCapture(e.pointerId);
  const [x, y] = ponto(e);
  emAndamento = {
    id: Math.max(0, ...formas.map((f) => f.id || 0)) + 1,
    tool: ferramenta,
    coords: [x, y, x, y],
    // hex sempre, até na tarja (que sai preta de qualquer jeito): toda forma
    // do .json tem cor no mesmo formato, sem exceção por ferramenta
    color: cor,
    width: ESPESSURA_PADRAO,
    dash: false,
    visible: true,
    ...(ESTILO[ferramenta] ? { estilo: ESTILO[ferramenta] } : {}),
  };
});

tela.addEventListener("pointermove", (e) => {
  if (!emAndamento) return;
  const [x, y] = ponto(e);
  emAndamento.coords[2] = x;
  emAndamento.coords[3] = y;
  ctx.drawImage(base, 0, 0);
  if (emAndamento.tool === "borrao") {
    // o desfoque de verdade sai ao soltar; durante o arraste, só o contorno
    const [x1, y1, x2, y2] = emAndamento.coords;
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = Math.max(2, tela.width / 600);
    ctx.strokeStyle = "#22A6BF";
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.setLineDash([]);
  } else {
    desenharForma(tela, emAndamento);
  }
});

tela.addEventListener("pointerup", () => {
  if (!emAndamento) return;
  const [x1, y1, x2, y2] = emAndamento.coords;
  const forma = emAndamento;
  emAndamento = null;
  // clique sem arrastar não cria forma
  if (Math.hypot(x2 - x1, y2 - y1) < 4) {
    ctx.drawImage(base, 0, 0);
    return;
  }
  // pixels da imagem com uma casa: o resto é ruído da escala da tela
  forma.coords = forma.coords.map((v) => Math.round(v * 10) / 10);
  desfazer.push(structuredClone(formas));
  formas.push(forma);
  mudouImagem = true;
  recompor();
});

// ------------------------------------------------------------ gravar
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("concluir").disabled = true;
  try {
    const campos = { caption: legenda.value.trim() };
    if (mudouImagem) {
      // a imagem final é redesenhada do original; o original nunca muda
      const imagem = await compor(original, formas).convertToBlob({ type: "image/png" });
      Object.assign(campos, {
        imagem,
        original: captura.original || captura.imagem,
        shapes: formas,
        miniatura: await miniatura(imagem),
        // anotação é edição; só a legenda não é
        editadaEm: Date.now(),
      });
    }
    await atualizarCaptura(id, campos);
    // é um clique: se faltar a permissão da pasta, o Chrome pergunta agora.
    // Negando, a captura continua guardada e o popup mostra a pendência.
    await sincronizar({ pedir: true });
    window.close();
  } catch (falha) {
    $("concluir").disabled = false;
    erro("Não gravou na pasta: " + (falha?.message || falha) + ". A imagem continua guardada na extensão.");
  }
});

$("excluir").addEventListener("click", async () => {
  if (!confirm("Excluir esta captura? Os arquivos dela saem da pasta também.")) return;
  try {
    await excluirCaptura(id);
    await sincronizar();
    window.close();
  } catch (e) {
    erro("Não excluiu: " + (e?.message || e));
  }
});
