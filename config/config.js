// Configurações: a pasta e os atalhos. É a página de opções da extensão, e é
// também o que abre na instalação. Escolher a pasta e dar a permissão só
// funcionam aqui, e não no popup: o popup fecha quando o Windows abre o
// seletor de pasta ou o Chrome abre o pedido de permissão.
import { sincronizar, trocarPasta } from "../lib/capturas.js";

const $ = (s) => document.getElementById(s);

// Relidos ao voltar para esta aba: o atalho é definido em outra aba
// (chrome://extensions/shortcuts), e só ler ao abrir deixava o valor velho.
// Ctrl+número o Chrome aceita, mas usa para trocar de aba, e o dele ganha.
async function mostrarAtalhos() {
  const texto = (atalho) => !atalho ? "sem atalho"
    : /^Ctrl\+\d$/.test(atalho) ? `${atalho} não funciona (é do Chrome): troque`
    : atalho;
  for (const c of await chrome.commands.getAll()) {
    if (c.name === "captura-aba") $("atalhoAba").textContent = texto(c.shortcut);
    if (c.name === "captura-tela") $("atalhoTela").textContent = texto(c.shortcut);
  }
}
await mostrarAtalhos();
document.addEventListener("visibilitychange", () => !document.hidden && mostrarAtalhos());
window.addEventListener("focus", mostrarAtalhos);
$("mudarAtalhos").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

function mostrar({ estado, faltam, pasta }) {
  $("pasta").hidden = !pasta;
  if (pasta) $("pasta").textContent = "📁 " + pasta.name;
  $("escolher").textContent = pasta ? "Trocar pasta" : "Escolher pasta";
  $("escolher").className = pasta ? "" : "primario";
  $("permitir").hidden = estado !== "sem-permissao";
  $("permitir").className = "primario";
  const aviso = $("estado");
  if (estado === "sem-pasta") {
    aviso.className = "aviso info";
    aviso.textContent = "Escolha a pasta onde os arquivos ficam. Essa configuração é realizada uma única vez.";
  } else if (estado === "sem-permissao") {
    aviso.className = "aviso info";
    aviso.textContent = faltam
      ? `O Chrome precisa da sua permissão para gravar. ${faltam === 1 ? "1 captura espera" : `${faltam} capturas esperam`} para ir para a pasta.`
      : "O Chrome vai pedir permissão para gravar na próxima captura.";
  } else {
    aviso.className = "aviso ok";
    aviso.textContent = "Tudo gravado na pasta.";
  }
}

// Escolheu a pasta ou deu a permissão: a configuração acabou, e a aba fecha.
async function concluir(acao) {
  try {
    const resultado = await acao();
    mostrar(resultado);
    if (resultado.estado === "ok") {
      const aba = await chrome.tabs.getCurrent();
      setTimeout(() => chrome.tabs.remove(aba.id), 800);
    }
  } catch (e) {
    if (e?.name === "AbortError") return;
    $("estado").className = "aviso erro";
    $("estado").textContent = "Não deu para usar essa pasta: " + (e?.message || e);
  }
}

$("escolher").addEventListener("click", () => concluir(async () => {
  await trocarPasta();
  return sincronizar();
}));
$("permitir").addEventListener("click", () => concluir(() => sincronizar({ pedir: true })));

mostrar(await sincronizar());
