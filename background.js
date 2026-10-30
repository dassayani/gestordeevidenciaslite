// Service worker: recebe os atalhos e os botões do popup.
//
// Não guarda estado em variável: o Chrome encerra o worker quando ele fica
// ocioso. O que precisa durar vai para o IndexedDB ou o chrome.storage.
import { novaCaptura, mostrarNovas, sincronizar } from "./lib/capturas.js";
import { recortar, blobDeDataUrl } from "./lib/imagem.js";
import { pastaEscolhida } from "./lib/pasta.js";

chrome.commands.onCommand.addListener((comando, aba) => {
  if (comando === "captura-aba") capturarAba(aba);
  else if (comando === "captura-tela") capturarTela();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.tipo === "captura-aba") capturarAba(msg.aba);
  else if (msg.tipo === "captura-tela") capturarTela();
});

chrome.notifications.onButtonClicked.addListener((id) => {
  if (id === "erro-aba") {
    chrome.notifications.clear(id);
    capturarTela();
  }
});

// Na instalação, abre só a escolha da pasta, que fecha sozinha depois.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install" && !(await pastaEscolhida())) {
    chrome.tabs.create({ url: "config/config.html?instalacao" });
  }
});

// Páginas em que o Chrome não deixa nenhuma extensão entrar.
const PAGINA_PROTEGIDA = /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/;

// ---------------------------------------------------------------- Modo Aba
async function capturarAba(aba) {
  try {
    if (!aba) [aba] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!aba) return;
    // Nas páginas internas (chrome://, Nova guia, Web Store) o Modo Aba não
    // entra. Antes isso caía calado no Modo Tela, e parecia que os botões
    // estavam trocados; agora avisa, com a mensagem do Chrome e a opção.
    if (PAGINA_PROTEGIDA.test(aba.url || "")) {
      await avisar("O Chrome não deixa capturar páginas internas dele pela aba.", { oferecerTela: true });
      return;
    }
    const capturadaEm = Date.now();
    await trabalhando();
    let quadro;
    try {
      quadro = await chrome.tabs.captureVisibleTab(aba.windowId, { format: "png" });
      await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ["content/seletor.js"] });
    } catch (e) {
      // a mensagem crua diz o porquê (política da empresa, PDF, arquivo local)
      await avisar(`O Chrome não deixou capturar esta aba (${e?.message || e}).`, { oferecerTela: true });
      return;
    }
    const [{ result: area }] = await chrome.scripting.executeScript({
      target: { tabId: aba.id },
      func: (url) => globalThis.__gelSelecionar(url),
      args: [quadro],
    });
    if (!area) {
      await limparAviso();
      return;
    }
    await trabalhando();

    const imagem = await recortar(await blobDeDataUrl(quadro), area);
    await limparAviso();
    // vai direto para a área de trabalho; a edição abre só com dois cliques lá
    await novaCaptura({
      imagem,
      capturadaEm,
      origem: { url: aba.url, titulo: aba.title },
    });
    // com a permissão da pasta já dada, o arquivo vai para lá agora; sem
    // ela, espera o próximo clique em Permitir
    await sincronizar().catch(() => {});
  } catch (e) {
    await avisar(e?.message || String(e));
  }
}

// ---------------------------------------------------------------- Modo Tela
// Quem captura é a aba fixada tela.html: o compartilhamento só pode ser usado
// pela página que o pediu, e precisa durar entre um print e outro. Aqui só
// se acha essa aba, ou se abre uma.
async function capturarTela() {
  const { abaTela } = await chrome.storage.session.get("abaTela");
  if (abaTela) {
    try {
      await chrome.tabs.get(abaTela);
      await chrome.runtime.sendMessage({ tipo: "tela-capturar" });
      return;
    } catch {
      // aba sumiu ou parou de responder: fecha o que sobrou e abre outra
      await chrome.tabs.remove(abaTela).catch(() => {});
    }
  }
  // na janela do Chrome em uso; a aba volta para a atual depois do seletor
  const [atual] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: "normal" });
  const url = chrome.runtime.getURL(`tela/tela.html${atual ? `?voltar=${atual.id}` : ""}`);
  if (atual) {
    await chrome.windows.update(atual.windowId, { focused: true });
    await chrome.tabs.create({ windowId: atual.windowId, url, pinned: true, active: true });
  } else {
    // nenhuma janela do Chrome aberta (atalho global com ele em segundo plano)
    await chrome.windows.create({ url, focused: true });
  }
}

chrome.tabs.onRemoved.addListener(async (id) => {
  const { abaTela } = await chrome.storage.session.get("abaTela");
  if (abaTela === id) await chrome.storage.session.remove("abaTela");
});

// ---------------------------------------------------------------- avisos
// Sem janela para mostrar o erro: vira notificação do Windows, e fica também
// no ícone (badge "!") e no popup. Só o "!" passava despercebido, e a
// impressão era de que a captura tinha travado.
async function avisar(texto, { oferecerTela = false } = {}) {
  chrome.notifications.create(oferecerTela ? "erro-aba" : "erro-captura", {
    type: "basic",
    iconUrl: "icones/icone128.png",
    title: "Não capturou",
    message: texto,
    ...(oferecerTela ? { buttons: [{ title: "Usar Qualquer tela" }] } : {}),
  });
  await chrome.storage.session.set({ ultimoErro: { texto, oferecerTela } });
  await chrome.action.setBadgeBackgroundColor({ color: "#B2280E" });
  await chrome.action.setBadgeText({ text: "!" });
  await chrome.action.setTitle({ title: "Não capturou: " + texto });
}

// "…" no ícone enquanto captura, recorta e grava: num PC carregado isso leva
// alguns segundos, e sem sinal nenhum parecia travado
async function trabalhando() {
  await chrome.action.setBadgeBackgroundColor({ color: "#0B7285" });
  await chrome.action.setBadgeText({ text: "…" });
}

async function limparAviso() {
  await chrome.storage.session.remove("ultimoErro");
  await mostrarNovas();
  await chrome.action.setTitle({ title: "Gestor de Evidências Lite" });
}
