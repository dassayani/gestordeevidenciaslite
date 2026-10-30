// A área de trabalho: as capturas ficam primeiro aqui, no banco da extensão,
// e daí são espelhadas na pasta.
//
// Assim a captura nunca para esperando pasta ou permissão. O Chrome só deixa
// gravar na pasta depois de um clique de permissão (uma vez por sessão, ou
// nunca mais com "Permitir em todas as visitas"); até lá, o que falta fica
// marcado e vai para a pasta no próximo sincronizar().
import { obter, gravar, apagar, listar } from "./idb.js";
import { miniatura } from "./imagem.js";
import {
  pastaEscolhida, escolherPasta, permissao, nomeLivre, gravarArquivos, removerCaptura,
} from "./pasta.js";

// As páginas abertas (popup, área de trabalho) se atualizam por aqui.
const avisarMudanca = () => chrome.storage.local.set({ capturasMudaram: Date.now() });

export function aoMudar(funcao) {
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === "local" && mudancas.capturasMudaram) funcao();
  });
}

export async function novaCaptura({ imagem, capturadaEm, origem }) {
  const id = await gravar("capturas", {
    imagem,
    miniatura: await miniatura(imagem),
    capturadaEm,
    origem: origem || null,
    caption: "",
    // o caso/projeto entra só no documento; aqui fica vazio
    caso: "",
    editadaEm: null,
    shapes: [],
    nome: null, // nome do arquivo na pasta, depois da primeira gravação
    naPasta: false,
    versao: 1,
  });
  await avisarMudanca();
  const { novas = 0 } = await chrome.storage.session.get("novas");
  await chrome.storage.session.set({ novas: novas + 1 });
  await mostrarNovas();
  return id;
}

// A captura não abre janela nenhuma: o sinal de que ela entrou é o número de
// novas no ícone, que zera quando o popup ou a área de trabalho abre.
export async function mostrarNovas() {
  const { novas = 0 } = await chrome.storage.session.get("novas");
  await chrome.action.setBadgeBackgroundColor({ color: "#0A7A5A" });
  await chrome.action.setBadgeText({ text: novas ? String(novas) : "" });
}

export async function zerarNovas() {
  await chrome.storage.session.set({ novas: 0 });
  await mostrarNovas();
}

export const obterCaptura = async (id) => {
  const c = await obter("capturas", id);
  return c && { ...c, id };
};

// Mais recentes primeiro.
export async function listarCapturas() {
  const todas = await listar("capturas");
  return todas.sort((a, b) => b.capturadaEm - a.capturadaEm);
}

export async function atualizarCaptura(id, campos) {
  const atual = await obter("capturas", id);
  if (!atual) throw new Error("Captura não encontrada.");
  await gravar("capturas", { ...atual, ...campos, naPasta: false, versao: atual.versao + 1 }, id);
  await avisarMudanca();
}

// Capturas marcadas para o documento. Ficam na sessão: o popup fecha a cada
// clique fora dele, e a seleção não pode ir junto.
export async function obterSelecao() {
  const { selecao = [] } = await chrome.storage.session.get("selecao");
  return selecao;
}

export async function alternarSelecao(id) {
  const atual = await obterSelecao();
  const selecao = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
  await chrome.storage.session.set({ selecao });
  return selecao;
}

export const limparSelecao = () => chrome.storage.session.set({ selecao: [] });

export async function excluirCaptura(id) {
  const atual = await obter("capturas", id);
  await apagar("capturas", id);
  const selecao = await obterSelecao();
  if (selecao.includes(id)) await chrome.storage.session.set({ selecao: selecao.filter((x) => x !== id) });
  // os arquivos saem da pasta no próximo sincronizar(), que tem a permissão
  if (atual?.nome) {
    const fila = (await obter("config", "removerDaPasta")) || [];
    await gravar("config", [...fila, atual.nome], "removerDaPasta");
  }
  await avisarMudanca();
}

// Troca a pasta e manda todas as capturas para a nova.
export async function trocarPasta() {
  await escolherPasta();
  await gravar("config", [], "removerDaPasta");
  for (const c of await listar("capturas")) {
    const { id, ...resto } = c;
    await gravar("capturas", { ...resto, nome: null, naPasta: false }, id);
  }
  await avisarMudanca();
}

// Espelha na pasta o que ainda não está lá. `pedir` só funciona dentro de um
// clique: é quando o Chrome aceita mostrar o pedido de permissão.
//
// Devolve { estado: "ok" | "sem-pasta" | "sem-permissao", faltam, pasta }.
export async function sincronizar({ pedir = false } = {}) {
  const pasta = await pastaEscolhida();
  // conta também as excluídas cujos arquivos ainda estão na pasta
  const contarFaltam = async () => (await listar("capturas")).filter((c) => !c.naPasta).length +
    ((await obter("config", "removerDaPasta")) || []).length;
  if (!pasta) return { estado: "sem-pasta", faltam: await contarFaltam(), pasta };
  if ((await permissao(pasta, pedir)) !== "granted") {
    return { estado: "sem-permissao", faltam: await contarFaltam(), pasta };
  }

  // popup, área de trabalho e janela da captura podem sincronizar ao mesmo
  // tempo: a trava evita a mesma captura gravada duas vezes (com _2)
  let mudou = false;
  await navigator.locks.request("gel-sincronia", async () => {
    for (const nome of (await obter("config", "removerDaPasta")) || []) {
      await removerCaptura(pasta, nome);
      mudou = true;
    }
    await gravar("config", [], "removerDaPasta");

    for (const c of await listar("capturas")) {
      if (c.naPasta) continue;
      const nome = c.nome || await nomeLivre(pasta, c.capturadaEm);
      await gravarArquivos(pasta, nome, c);
      // se a legenda mudou enquanto gravava, continua pendente
      const agora = await obter("capturas", c.id);
      if (agora) await gravar("capturas", { ...agora, nome, naPasta: agora.versao === c.versao }, c.id);
      mudou = true;
    }
  });
  if (mudou) await avisarMudanca();
  return { estado: "ok", faltam: await contarFaltam(), pasta };
}
