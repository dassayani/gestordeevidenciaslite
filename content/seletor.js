// Seleção de área sobre um quadro congelado. Serve aos dois modos: é injetado
// na página no Modo Aba e carregado pela janela do Modo Tela.
//
// O quadro é tirado ANTES de a seleção aparecer:
// menu aberto, tooltip e hover continuam no print mesmo depois de o mouse se
// mexer para arrastar.
//
// Devolve a área em pixels CSS junto com o tamanho da superfície (vw x vh),
// para o recorte escalar para os pixels do quadro; ou null se cancelou.
// Script clássico, e não módulo: content script injetado não importa módulos.
(() => {
  if (globalThis.__gelSelecionar) return;

  const ESTILO = `
    :host { all: initial; }
    .palco { position: fixed; inset: 0; cursor: crosshair; user-select: none; }
    img, canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .escuro { position: absolute; inset: 0; background: rgba(9, 20, 26, .45); }
    .caixa {
      position: absolute; display: none;
      outline: 2px solid #22A6BF;
      box-shadow: 0 0 0 100vmax rgba(9, 20, 26, .45);
    }
    .medida, .dica {
      position: absolute; font: 600 12px "Segoe UI", sans-serif; color: #fff;
      background: #0B7285; border-radius: 6px; padding: 3px 8px; white-space: nowrap;
    }
    .medida { display: none; }
    .dica { top: 16px; left: 50%; transform: translateX(-50%); padding: 6px 12px; }
  `;

  // `quadro`: URL da imagem (Modo Aba) ou um ImageBitmap (Modo Tela), que é
  // desenhado direto, sem codificar e decodificar uma PNG do monitor inteiro
  globalThis.__gelSelecionar = (quadro) => new Promise((resolver) => {
    const host = document.createElement("div");
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const raiz = host.attachShadow({ mode: "closed" });
    raiz.innerHTML = `<style>${ESTILO}</style>
      <div class="palco">
        <img alt="">
        <div class="escuro"></div>
        <div class="caixa"></div>
        <div class="medida"></div>
        <div class="dica">Arraste para selecionar · clique = área inteira · Esc cancela</div>
      </div>`;
    const palco = raiz.querySelector(".palco");
    const img = raiz.querySelector("img");
    const escuro = raiz.querySelector(".escuro");
    const caixa = raiz.querySelector(".caixa");
    const medida = raiz.querySelector(".medida");
    const dica = raiz.querySelector(".dica");

    let inicio = null;
    let area = null;

    const terminar = (resultado) => {
      window.removeEventListener("keydown", teclado, true);
      host.remove();
      resolver(resultado);
    };

    const teclado = (e) => {
      if (e.key !== "Escape") return;
      // a página não pode reagir ao Esc da seleção (fechar o modal que se
      // queria justamente capturar, por exemplo)
      e.preventDefault();
      e.stopImmediatePropagation();
      terminar(null);
    };

    palco.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      palco.setPointerCapture(e.pointerId);
      inicio = { x: e.clientX, y: e.clientY };
      area = null;
    });

    palco.addEventListener("pointermove", (e) => {
      if (!inicio) return;
      const x = Math.min(inicio.x, e.clientX);
      const y = Math.min(inicio.y, e.clientY);
      const w = Math.abs(e.clientX - inicio.x);
      const h = Math.abs(e.clientY - inicio.y);
      if (w < 4 && h < 4) return;
      area = { x, y, w, h };
      escuro.style.display = "none";
      dica.style.display = "none";
      Object.assign(caixa.style, { display: "block", left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
      // tamanho em pixels reais, que é o que o arquivo vai ter
      const r = window.devicePixelRatio || 1;
      medida.textContent = `${Math.round(w * r)} × ${Math.round(h * r)}`;
      Object.assign(medida.style, { display: "block", left: x + "px", top: Math.max(0, y - 26) + "px" });
    });

    palco.addEventListener("pointerup", () => {
      if (!inicio) return;
      inicio = null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // clique sem arrastar: a área visível inteira
      terminar(area ? { ...area, vw, vh } : { x: 0, y: 0, w: vw, h: vh, vw, vh });
    });

    window.addEventListener("keydown", teclado, true);
    if (typeof quadro === "string") {
      img.src = quadro;
    } else {
      const tela = document.createElement("canvas");
      tela.width = quadro.width;
      tela.height = quadro.height;
      tela.getContext("2d").drawImage(quadro, 0, 0);
      img.replaceWith(tela);
    }
    // aparece já, sem esperar a imagem decodificar: o img.decode() podia
    // demorar segundos, ou nunca resolver, e a seleção não surgia ("travou")
    document.documentElement.appendChild(host);
  });
})();
