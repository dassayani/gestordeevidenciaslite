// Recorte da área escolhida sobre o quadro congelado.
//
// `area` vem em pixels CSS da superfície onde foi selecionada (vw x vh), e o
// quadro está em pixels físicos. Com o Windows em 150%, um pixel CSS são 1,5
// do quadro: sem a escala, o recorte sairia deslocado e menor que o pedido.
export async function recortar(origem, area) {
  const bitmap = origem instanceof ImageBitmap ? origem : await createImageBitmap(origem);
  const escalaX = bitmap.width / area.vw;
  const escalaY = bitmap.height / area.vh;
  const x = Math.max(0, Math.round(area.x * escalaX));
  const y = Math.max(0, Math.round(area.y * escalaY));
  const w = Math.max(1, Math.min(bitmap.width - x, Math.round(area.w * escalaX)));
  const h = Math.max(1, Math.min(bitmap.height - y, Math.round(area.h * escalaY)));

  const tela = new OffscreenCanvas(w, h);
  tela.getContext("2d").drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  return tela.convertToBlob({ type: "image/png" });
}

// Miniatura para a área de trabalho: carregar dezenas de PNGs inteiros só
// para mostrar a grade pesaria a página.
export async function miniatura(origem, largura = 360) {
  const bitmap = await createImageBitmap(origem);
  const escala = Math.min(1, largura / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const tela = new OffscreenCanvas(w, h);
  const ctx = tela.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return tela.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

export async function blobDeDataUrl(url) {
  return (await fetch(url)).blob();
}
