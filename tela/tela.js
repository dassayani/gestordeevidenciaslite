// Aba fixada do Modo Tela. O Chrome só deixa usar o compartilhamento de tela
// na página que o pediu (testado: nem um documento offscreen da própria
// extensão consegue), então alguém precisa ficar aberto. Uma aba fixada é o
// mais discreto: um ícone no canto das abas, sem janela na barra de tarefas.
//
// Cada captura congela um quadro e abre a seleção de área sobre ele numa
// janela própria, em tela cheia.
import { gravar } from "../lib/idb.js";
import { abrirJanelaSelecao } from "../lib/janelas.js";

const estado = document.getElementById("estado");
const parametros = new URLSearchParams(location.search);
// a aba em que a pessoa estava: volta para ela depois de escolher a tela
const voltarPara = Number(parametros.get("voltar")) || null;

const eu = await chrome.tabs.getCurrent();
await chrome.storage.session.set({ abaTela: eu.id });

let trilha = null;
let ocupado = false;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

function mostrar(texto, tipo = "info") {
  estado.textContent = texto;
  estado.className = "aviso " + tipo;
}

function escolherTela() {
  // só "screen": o pedido já vem na tela inteira, sem as abas e janelas
  return new Promise((ok) => chrome.desktopCapture.chooseDesktopMedia(["screen"], eu, (id) => ok(id)));
}

async function compartilhar() {
  mostrar("Escolha a tela no seletor do Chrome e clique em Compartilhar.");
  await chrome.tabs.update(eu.id, { active: true });
  const id = await escolherTela();
  if (!id) return false;
  const fluxo = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: id,
        // sem teto explícito o Chrome reduz o quadro; com ele vem a
        // resolução real do monitor
        maxWidth: 7680,
        maxHeight: 4320,
        maxFrameRate: 5,
      },
    },
  });
  trilha = fluxo.getVideoTracks()[0];
  // "Parar compartilhamento" na barra do Chrome encerra a trilha por fora
  trilha.addEventListener("ended", () => {
    trilha = null;
    mostrar("Compartilhamento encerrado. A próxima captura de tela pede a tela de novo.");
  });
  mostrar("Compartilhamento ativo. Esta aba pode ficar fixada aí; fechar ela encerra o compartilhamento.", "ok");
  return true;
}

// Logo depois de o compartilhamento começar, os primeiros quadros podem vir
// pretos: era a "tela preta" na seleção. Tenta de novo até vir imagem.
function preto(bitmap) {
  const amostra = new OffscreenCanvas(16, 16).getContext("2d");
  amostra.drawImage(bitmap, 0, 0, 16, 16);
  const px = amostra.getImageData(0, 0, 16, 16).data;
  for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 24) return false;
  return true;
}

async function pegarQuadro() {
  const prazo = Date.now() + 5000;
  let bitmap = null;
  while (Date.now() < prazo) {
    const limite = new Promise((_, falha) =>
      setTimeout(() => falha(new Error("a tela compartilhada não mandou imagem em 5 s")), Math.max(100, prazo - Date.now())));
    bitmap = await Promise.race([new ImageCapture(trilha).grabFrame(), limite]);
    if (!preto(bitmap)) return bitmap;
    await esperar(150);
  }
  // uma tela realmente toda preta também é um print válido
  if (bitmap) return bitmap;
  throw new Error("a tela compartilhada não mandou imagem em 5 s");
}

// Pixels crus (ImageData), e não PNG: codificar o monitor inteiro em PNG aqui
// e decodificar de novo na seleção levava segundos com a tela preta.
function pixels(bitmap) {
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

async function capturar() {
  if (ocupado) return;
  ocupado = true;
  try {
    if (!trilha) {
      if (!(await compartilhar())) {
        // cancelou o seletor: a aba não tem mais o que fazer
        await voltar();
        window.close();
        return;
      }
    }
    // esta aba não pode sair no print: volta para onde a pessoa estava
    if ((await chrome.tabs.getCurrent()).active) {
      await voltar();
      await esperar(400);
    }
    const capturadaEm = Date.now();
    const quadro = await pegarQuadro();
    // A janela abre JUNTO com a gravação, e não depois: abrir a janela é a
    // etapa mais lenta (medido: ~340 ms de ~520), e a seleção espera o quadro
    // chegar ao banco. A chave é o instante, para a URL já sair com ela.
    const id = capturadaEm;
    await Promise.all([
      gravar("quadros", { pixels: pixels(quadro), capturadaEm }, id),
      abrirJanelaSelecao(id, quadro.width, quadro.height),
    ]);
  } catch (e) {
    mostrar("Não capturou: " + (e?.message || e), "erro");
    chrome.notifications.create("erro-captura", {
      type: "basic", iconUrl: "../icones/icone128.png", title: "Não capturou", message: e?.message || String(e),
    });
  } finally {
    // nunca fica preso em "ocupado": era o que travava os cliques seguintes
    ocupado = false;
  }
}

async function voltar() {
  if (voltarPara) await chrome.tabs.update(voltarPara, { active: true }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.tipo === "tela-capturar") capturar();
});

document.getElementById("parar").addEventListener("click", () => {
  trilha?.stop();
  window.close();
});

// aberta por um atalho ou pelo popup: quem abriu queria um print
capturar();
