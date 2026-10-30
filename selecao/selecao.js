// Seleção de área do Modo Tela, sobre o quadro congelado pela aba fixada.
// Abre em tela cheia no monitor capturado e fecha sozinha.
//
// Carrega só o necessário para mostrar a imagem; a gravação da captura
// (capturas.js, pasta, miniatura) só é buscada depois de soltar o mouse.
import { obter, apagar } from "../lib/idb.js";
import { recortar } from "../lib/imagem.js";

const id = Number(new URLSearchParams(location.search).get("id"));

// Saída de emergência: se algo falhar antes de a seleção aparecer, a janela
// em tela cheia ficava preta e sem como fechar. Depois que a seleção aparece,
// o Esc dela cancela primeiro (e não chega aqui).
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.close();
});

// A janela abre junto com a gravação do quadro: ele pode chegar ao banco
// alguns milissegundos depois dela.
async function esperarQuadro() {
  const prazo = Date.now() + 5000;
  while (Date.now() < prazo) {
    const quadro = await obter("quadros", id);
    if (quadro) return quadro;
    await new Promise((ok) => setTimeout(ok, 15));
  }
  throw new Error("O quadro capturado não foi encontrado.");
}

try {
  const quadro = await esperarQuadro();
  apagar("quadros", id);

  // os pixels crus, sem PNG no caminho: aparece na hora
  const bitmap = await createImageBitmap(quadro.pixels);
  // a área volta como fração da janela (vw x vh), então o recorte sai certo
  // mesmo que a tela cheia demore a assumir o tamanho final
  const area = await globalThis.__gelSelecionar(bitmap);
  if (area) {
    const [imagem, { novaCaptura, sincronizar }] = await Promise.all([
      recortar(bitmap, area),
      import("../lib/capturas.js"),
    ]);
    await novaCaptura({ imagem, capturadaEm: quadro.capturadaEm, origem: null });
    await sincronizar().catch(() => {});
  }
  window.close();
} catch (e) {
  const erro = document.getElementById("erro");
  erro.textContent = "Não capturou: " + (e?.message || e) + " — clique para fechar.";
  erro.style.display = "flex";
  document.addEventListener("click", () => window.close());
}
