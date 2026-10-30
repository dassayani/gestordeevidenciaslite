// Janela de edição de uma captura (seta, borrar, tarja, legenda).
export function abrirJanelaCaptura(id) {
  return chrome.windows.create({
    url: chrome.runtime.getURL(`captura/captura.html?id=${id}`),
    type: "popup",
    width: 1000,
    height: 760,
    focused: true,
  });
}

// Gerar documento, com as imagens marcadas no popup.
export function abrirJanelaDocumento() {
  return chrome.windows.create({
    url: chrome.runtime.getURL("documento/documento.html"),
    type: "popup",
    width: 760,
    height: 780,
    focused: true,
  });
}

// O monitor que o Modo Tela capturou: o que tem o tamanho, em pixels reais,
// do quadro. O compartilhamento não diz qual tela foi escolhida, então a
// conta é pela resolução; com dois monitores iguais, fica o principal.
// Guardado por resolução: o monitor não muda entre um print e outro, e assim
// cada captura não consulta o Windows de novo.
const monitores = new Map();

async function monitorDoQuadro(largura, altura) {
  const chave = `${largura}x${altura}`;
  if (!monitores.has(chave)) monitores.set(chave, await procurarMonitor(largura, altura));
  return monitores.get(chave);
}

async function procurarMonitor(largura, altura) {
  const telas = await chrome.system.display.getInfo();
  const reais = (t) => {
    const escala = (t.dpiX || 96) / 96;
    return [t.bounds.width * escala, t.bounds.height * escala];
  };
  const distancia = (t) => {
    const [w, h] = reais(t);
    return Math.abs(w - largura) + Math.abs(h - altura);
  };
  const ordenadas = [...telas].sort((a, b) =>
    distancia(a) - distancia(b) || (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
  return ordenadas[0];
}

// Seleção de área do Modo Tela: uma janela NOVA em tela cheia. Restaurar a
// janela do compartilhamento depois de minimizada não funciona, porque o
// Windows não deixa uma janela minimizada voltar para a frente sozinha.
export async function abrirJanelaSelecao(id, largura, altura) {
  const tela = await monitorDoQuadro(largura, altura);
  const { left, top, width, height } = tela.bounds;
  const janela = await chrome.windows.create({
    url: chrome.runtime.getURL(`selecao/selecao.html?id=${id}`),
    type: "popup",
    left, top, width, height,
    focused: true,
  });
  // tela cheia não aceita posição na criação: primeiro vai para o monitor,
  // depois ocupa ele inteiro
  await chrome.windows.update(janela.id, { state: "fullscreen", focused: true });
  return janela;
}
