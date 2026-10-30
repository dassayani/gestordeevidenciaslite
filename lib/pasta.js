// A pasta de capturas. Cada captura são três arquivos irmãos:
//
//   print_20261029_143052.png       imagem (com anotações, quando houver)
//   print_20261029_143052.raw.png   original, para reeditar
//   print_20261029_143052.json      metadados
//
import { obter, gravar } from "./idb.js";

export const pastaEscolhida = () => obter("config", "pasta");

// Só funciona dentro de um clique, e não no popup da barra: o popup fecha
// quando o seletor de pasta do Windows abre e leva a promessa junto. Quem
// troca a pasta é trocarPasta(), em capturas.js, que reenvia tudo para a nova.
export async function escolherPasta() {
  const pasta = await showDirectoryPicker({ id: "capturas", mode: "readwrite", startIn: "pictures" });
  await gravar("config", pasta, "pasta");
  return pasta;
}

// "granted", "prompt" ou "denied". Com `pedir`, abre o pedido do Chrome, que
// também exige um clique do usuário.
export async function permissao(pasta, pedir = false) {
  const modo = { mode: "readwrite" };
  let estado = await pasta.queryPermission(modo);
  if (estado === "prompt" && pedir) {
    estado = await pasta.requestPermission(modo);
  }
  return estado;
}

const dois = (n) => String(n).padStart(2, "0");

// ISO 8601 em hora local, sem fuso: AAAA-MM-DDTHH:MM:SS.
export function isoLocal(instante) {
  const d = new Date(instante);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}` +
    `T${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

// print_AAAAMMDD_HHMMSS.png, com _2, _3...
// quando o nome já existe: nenhuma captura sobrescreve outra.
export async function nomeLivre(pasta, instante) {
  const d = new Date(instante);
  const base = `print_${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}` +
    `_${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;
  for (let n = 1; ; n++) {
    const nome = `${base}${n > 1 ? "_" + n : ""}.png`;
    try {
      await pasta.getFileHandle(nome);
    } catch (e) {
      if (e.name === "NotFoundError") return nome;
      throw e;
    }
  }
}

const radical = (nome) => nome.replace(/\.png$/i, "");

async function escrever(pasta, nome, conteudo) {
  const arquivo = await pasta.getFileHandle(nome, { create: true });
  const saida = await arquivo.createWritable();
  await saida.write(conteudo);
  await saida.close();
}

// Os três arquivos de uma captura da área de trabalho.
export async function gravarArquivos(pasta, nome, captura) {
  await escrever(pasta, nome, captura.imagem);
  await escrever(pasta, radical(nome) + ".raw.png", captura.original || captura.imagem);
  const meta = {
    caption: captura.caption,
    caso: captura.caso,
    // legenda não conta como edição: só anotação na imagem
    edited_at: captura.editadaEm ? isoLocal(captura.editadaEm) : null,
    captured_at: isoLocal(captura.capturadaEm),
    shapes: captura.shapes || [],
    // de que página veio o print (Modo Aba)
    origem: captura.origem || null,
  };
  await escrever(pasta, radical(nome) + ".json", JSON.stringify(meta));
}

export async function removerCaptura(pasta, nome) {
  for (const arquivo of [nome, radical(nome) + ".raw.png", radical(nome) + ".json"]) {
    try {
      await pasta.removeEntry(arquivo);
    } catch (e) {
      if (e.name !== "NotFoundError") throw e;
    }
  }
}
