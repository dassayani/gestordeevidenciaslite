// Gerar documento: as imagens marcadas no popup, na ordem em que foram
// marcadas, num PDF com um dos 3 modelos. O Caso/Projeto entra só
// aqui, e não na captura.
import { obterCaptura, obterSelecao } from "../lib/capturas.js";
import { obter, gravar } from "../lib/idb.js";
import { pastaEscolhida, permissao } from "../lib/pasta.js";
import { gerarPdf } from "../lib/pdf.js";

const $ = (s) => document.getElementById(s);
const dois = (n) => String(n).padStart(2, "0");

const ids = await obterSelecao();
const capturas = (await Promise.all(ids.map(obterCaptura))).filter(Boolean);

// o que se repete de um documento para o outro vem preenchido
const lembrado = (await obter("config", "documento")) || {};
$("autor").value = lembrado.autor || "";
$("ambiente").value = lembrado.ambiente || "";
const hoje = new Date();
$("data").value = `${dois(hoje.getDate())}/${dois(hoje.getMonth() + 1)}/${hoje.getFullYear()}`;
if (lembrado.modelo) document.querySelector(`input[name="modelo"][value="${lembrado.modelo}"]`)?.click();
$("caso").focus();

// Ordem do documento: por padrão da mais antiga para a mais nova; as setas
// ajustam uma a uma depois.
const miniaturas = new Map(capturas.map((c) => [c.id, URL.createObjectURL(c.miniatura)]));
let ordem = [];

function ordenar(sentido) {
  ordem = [...capturas].sort((a, b) =>
    sentido === "nova" ? b.capturadaEm - a.capturadaEm : a.capturadaEm - b.capturadaEm);
  desenharLista();
}

function mover(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= ordem.length) return;
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  desenharLista();
  $("lista").children[j]?.querySelector(delta < 0 ? ".subir" : ".descer")?.focus();
}

function desenharLista() {
  $("lista").replaceChildren(...ordem.map((c, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="n">${i + 1}</span><img alt=""><span class="legenda"></span>
      <span class="mover">
        <button type="button" class="subir" title="Subir" aria-label="Subir">↑</button>
        <button type="button" class="descer" title="Descer" aria-label="Descer">↓</button>
      </span>`;
    li.querySelector("img").src = miniaturas.get(c.id);
    const legenda = li.querySelector(".legenda");
    legenda.textContent = c.caption || "Sem legenda (sai em branco)";
    legenda.classList.toggle("sem", !c.caption);
    li.querySelector(".subir").disabled = i === 0;
    li.querySelector(".descer").disabled = i === ordem.length - 1;
    li.querySelector(".subir").addEventListener("click", () => mover(i, -1));
    li.querySelector(".descer").addEventListener("click", () => mover(i, 1));
    return li;
  }));
}

$("tituloLista").textContent = capturas.length === 1 ? "1 imagem" : `${capturas.length} imagens, nesta ordem`;
$("ordenar").addEventListener("change", (e) => ordenar(e.target.value));
ordenar("antiga");
if (!capturas.length) {
  $("erro").textContent = "Nenhuma imagem selecionada. Marque as imagens no popup da extensão.";
  $("erro").hidden = false;
  $("gerar").disabled = true;
}

// "Título - Caso - Ambiente.pdf", só com o que foi preenchido e sem os
// caracteres que o Windows recusa em nome de arquivo
function nomeArquivo({ titulo, caso, ambiente }) {
  const partes = [titulo || "Evidências de teste", caso, ambiente]
    .map((p) => p.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return partes.join(" - ").slice(0, 150).replace(/[. ]+$/, "") + ".pdf";
}

// Mesmo título, caso e ambiente de um documento anterior: não sobrescreve,
// vira "... (2).pdf"
async function nomeLivre(pasta, nome) {
  const radical = nome.replace(/\.pdf$/, "");
  for (let n = 1; ; n++) {
    const tentativa = n === 1 ? nome : `${radical} (${n}).pdf`;
    try {
      await pasta.getFileHandle(tentativa);
    } catch (e) {
      if (e.name === "NotFoundError") return tentativa;
      throw e;
    }
  }
}

let urlPdf = null;

$("gerar").addEventListener("click", async () => {
  $("erro").hidden = true;
  $("resultado").hidden = true;
  $("gerar").disabled = true;
  $("gerar").textContent = "Gerando…";
  try {
    // A permissão da pasta é pedida já, colada no clique: o Chrome só mostra
    // o pedido logo depois de um clique, e gerar um documento grande leva
    // mais que esse prazo. Sem pasta, ou negando, vai para Downloads.
    const pasta = await pastaEscolhida();
    const naPasta = !!pasta && (await permissao(pasta, true)) === "granted";
    const modelo = document.querySelector('input[name="modelo"]:checked').value;
    const capa = {
      titulo: $("titulo").value.trim(),
      caso: $("caso").value.trim(),
      ambiente: $("ambiente").value.trim(),
      autor: $("autor").value.trim(),
      data: $("data").value.trim(),
    };
    await gravar("config", { autor: capa.autor, ambiente: capa.ambiente, modelo }, "documento");

    const pdf = await gerarPdf(modelo, capa, ordem.map((c) => ({ imagem: c.imagem, legenda: c.caption })));
    let nome = nomeArquivo(capa);
    if (urlPdf) URL.revokeObjectURL(urlPdf);
    urlPdf = URL.createObjectURL(pdf);
    const tamanho = pdf.size < 1024 * 1024
      ? `${Math.max(1, Math.round(pdf.size / 1024))} KB`
      : `${(pdf.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

    if (naPasta) {
      nome = await nomeLivre(pasta, nome);
      const arquivo = await pasta.getFileHandle(nome, { create: true });
      const saida = await arquivo.createWritable();
      await saida.write(pdf);
      await saida.close();
      $("resultadoTexto").textContent = `Salvo em 📁 ${pasta.name}\\${nome} (${tamanho}).`;
    } else {
      const a = document.createElement("a");
      a.href = urlPdf;
      a.download = nome;
      a.click();
      $("resultadoTexto").textContent = `Baixado em Downloads: ${nome} (${tamanho}).`;
    }
    $("resultado").hidden = false;
  } catch (e) {
    $("erro").textContent = "Não gerou o documento: " + (e?.message || e);
    $("erro").hidden = false;
  } finally {
    $("gerar").disabled = !capturas.length;
    $("gerar").textContent = "Gerar PDF";
  }
});

$("abrir").addEventListener("click", () => urlPdf && chrome.tabs.create({ url: urlPdf }));
$("fechar").addEventListener("click", () => window.close());
