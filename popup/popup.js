// O popup é a área de trabalho: captura, as imagens do dia, a seleção para o
// documento e a edição (dois cliques). Pasta e atalhos ficam em Configurações,
// porque o popup fecha quando o Windows abre o seletor de pasta.
import {
  listarCapturas, excluirCaptura, sincronizar, zerarNovas,
  obterSelecao, alternarSelecao, limparSelecao,
} from "../lib/capturas.js";
import { abrirJanelaCaptura, abrirJanelaDocumento } from "../lib/janelas.js";

const $ = (s) => document.getElementById(s);
const abrirConfig = () => { chrome.runtime.openOptionsPage(); window.close(); };

// Os atalhos reais. O Chrome não aplica sozinho um atalho que choca com um
// dele: aí aparece "definir atalho", que leva direto à tela onde se define à
// mão, uma vez. Ctrl+número ele até aceita à mão, mas o dele (trocar de aba)
// ganha e o da extensão nunca dispara: aí aparece "trocar atalho".
for (const c of await chrome.commands.getAll()) {
  const alvo = c.name === "captura-aba" ? $("atalhoAba") : c.name === "captura-tela" ? $("atalhoTela") : null;
  if (!alvo) continue;
  const doChrome = /^Ctrl\+\d$/.test(c.shortcut || "");
  alvo.textContent = !c.shortcut ? "definir atalho" : doChrome ? "trocar atalho" : c.shortcut;
  if (!c.shortcut || doChrome) {
    alvo.title = doChrome
      ? `${c.shortcut} é do Chrome (trocar de aba) e não chega à extensão. Clique para trocar.`
      : "Abrir a tela de atalhos do Chrome";
    alvo.style.textDecoration = "underline";
    alvo.addEventListener("click", (e) => {
      e.stopPropagation(); // não dispara a captura do botão
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      window.close();
    });
  }
}

// erro da última captura, que não tinha janela onde aparecer
const { ultimoErro } = await chrome.storage.session.get("ultimoErro");
if (ultimoErro) {
  // versões anteriores guardavam só o texto
  const { texto, oferecerTela } = typeof ultimoErro === "string" ? { texto: ultimoErro } : ultimoErro;
  $("erroTexto").textContent = texto;
  $("erroTela").hidden = !oferecerTela;
  $("erro").hidden = false;
  await chrome.storage.session.remove("ultimoErro");
}
await zerarNovas();

// A aba vai junto: é a desta janela, e não a da última janela focada, que
// pode ser outra (a seleção do Modo Tela, uma página interna...).
$("aba").addEventListener("click", async () => {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.runtime.sendMessage({ tipo: "captura-aba", aba });
  window.close();
});
const capturarTela = async () => {
  await chrome.runtime.sendMessage({ tipo: "captura-tela" });
  window.close();
};
$("tela").addEventListener("click", capturarTela);
$("erroTela").addEventListener("click", capturarTela);
$("config").addEventListener("click", abrirConfig);

// ------------------------------------------------------------------ dias
const capturas = await listarCapturas();
const chaveDia = (instante) => {
  const d = new Date(instante);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hoje = chaveDia(Date.now());
// dias com imagens, do mais novo ao mais antigo
const dias = [...new Set(capturas.map((c) => chaveDia(c.capturadaEm)))];
let diaAtual = hoje;

function rotulo(dia) {
  if (dia === hoje) return "Hoje";
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  if (dia === chaveDia(ontem)) return "Ontem";
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function mudarDia(dia) {
  diaAtual = dia;
  desenhar();
}

// ◀ ▶ andam um dia por vez (antes pulavam só entre dias com imagens, e com
// imagens só de hoje pareciam quebradas); o futuro não tem imagens
function somarDias(dia, n) {
  const [a, m, d] = dia.split("-").map(Number);
  return chaveDia(new Date(a, m - 1, d + n));
}
$("anterior").addEventListener("click", () => mudarDia(somarDias(diaAtual, -1)));
$("seguinte").addEventListener("click", () => {
  if (diaAtual < hoje) mudarDia(somarDias(diaAtual, 1));
});
$("abrirCalendario").addEventListener("click", () => {
  $("calendario").value = diaAtual;
  $("calendario").max = hoje;
  try {
    $("calendario").showPicker();
  } catch {
    $("calendario").focus();
  }
});
$("calendario").addEventListener("change", (e) => e.target.value && mudarDia(e.target.value));
$("ultimoDia").addEventListener("click", () => mudarDia(dias.find((d) => d < diaAtual) || dias[0]));

// ------------------------------------------------------------------ grade
let selecao = (await obterSelecao()).filter((id) => capturas.some((c) => c.id === id));
let urls = [];

function marcar() {
  for (const botao of $("grade").children) {
    const ordem = selecao.indexOf(Number(botao.dataset.id));
    botao.classList.toggle("marcada", ordem >= 0);
    botao.querySelector(".ordem").hidden = ordem < 0;
    // ✓, e não número: a ordem do documento se decide na janela Gerar documento
    botao.querySelector(".ordem").textContent = "✓";
  }
  // o total, e não só as do dia: um documento pode juntar dias diferentes
  $("selecao").hidden = selecao.length === 0;
  $("selecaoTexto").textContent = selecao.length === 1 ? "1 selecionada" : `${selecao.length} selecionadas`;
}

function item(c) {
  const botao = document.createElement("div");
  botao.className = "item";
  botao.dataset.id = c.id;
  botao.tabIndex = 0;
  botao.title = (c.caption || "Sem legenda") + "\nUm clique para selecionar · Dois cliques para editar";
  const url = URL.createObjectURL(c.miniatura);
  urls.push(url);
  botao.innerHTML = `<img alt=""><span class="ordem" hidden></span>
    <button class="excluir" title="Excluir" aria-label="Excluir">×</button>`;
  botao.querySelector("img").src = url;
  if (!c.naPasta) {
    const fora = document.createElement("span");
    fora.className = "fora";
    fora.title = "Ainda não está na pasta";
    botao.append(fora);
  }

  // Um clique marca para o documento; dois cliques editam. O duplo clique
  // passa por dois cliques, que se anulam.
  botao.addEventListener("click", async () => {
    selecao = await alternarSelecao(c.id);
    marcar();
  });
  botao.addEventListener("dblclick", async () => {
    await abrirJanelaCaptura(c.id);
    window.close();
  });

  // Exclusão com confirmação no próprio botão: um confirm() pode fechar o popup
  const excluir = botao.querySelector(".excluir");
  excluir.addEventListener("dblclick", (e) => e.stopPropagation());
  excluir.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!excluir.classList.contains("confirmar")) {
      excluir.classList.add("confirmar");
      excluir.textContent = "Excluir?";
      setTimeout(() => {
        excluir.classList.remove("confirmar");
        excluir.textContent = "×";
      }, 3000);
      return;
    }
    await excluirCaptura(c.id);
    capturas.splice(capturas.indexOf(c), 1);
    selecao = selecao.filter((x) => x !== c.id);
    desenhar();
    sincronizar().catch(() => {});
  });
  return botao;
}

function desenhar() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  $("dia").textContent = rotulo(diaAtual);
  $("seguinte").disabled = diaAtual >= hoje;

  const doDia = capturas.filter((c) => chaveDia(c.capturadaEm) === diaAtual);
  $("grade").replaceChildren(...doDia.map(item));
  $("grade").hidden = doDia.length === 0;
  $("vazio").hidden = doDia.length > 0;
  $("dicaSelecao").hidden = doDia.length === 0;
  if (!doDia.length) {
    $("vazioTexto").textContent = diaAtual === hoje ? "Nenhuma imagem hoje." : `Nenhuma imagem em ${rotulo(diaAtual)}.`;
    const antes = dias.find((d) => d < diaAtual);
    $("ultimoDia").hidden = !antes;
    if (antes) $("ultimoDia").textContent = `Ver ${rotulo(antes)}`;
  }
  marcar();
}

$("gerar").addEventListener("click", async () => {
  await abrirJanelaDocumento();
  window.close();
});

$("limpar").addEventListener("click", async () => {
  await limparSelecao();
  selecao = [];
  marcar();
});

desenhar();

// ------------------------------------------------------------------ pasta
const { estado, faltam, pasta } = await sincronizar();
if (pasta) $("pasta").textContent = "📁 " + pasta.name;
if (estado === "sem-pasta") {
  $("pendenciaTexto").textContent = "Escolha a pasta onde os arquivos ficam. Essa configuração é realizada uma única vez.";
  $("pendenciaAcao").textContent = "Escolher";
  $("pendencia").hidden = false;
} else if (faltam > 0) {
  $("pendenciaTexto").textContent = `${faltam} ${faltam === 1 ? "imagem ainda não está" : "imagens ainda não estão"} na pasta.`;
  $("pendenciaAcao").textContent = "Permitir";
  $("pendencia").hidden = false;
}
$("pendenciaAcao").addEventListener("click", abrirConfig);
// a sincronização pode ter levado imagens para a pasta: tira os pontinhos
if (estado === "ok") {
  for (const c of capturas) c.naPasta = true;
  desenhar();
}
