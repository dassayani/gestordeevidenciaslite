// Banco local da extensão (IndexedDB). Guarda o que o chrome.storage não
// guarda: as capturas (a área de trabalho) e o acesso à pasta escolhida (um
// FileSystemDirectoryHandle só sobrevive aqui).
const NOME = "gestor-evidencias-lite";
const VERSAO = 3;

function abrir() {
  return new Promise((ok, falha) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      // "capturas": a área de trabalho, de onde a pasta é espelhada
      // "quadros": a tela inteira congelada pelo Modo Tela, até a seleção
      for (const loja of ["capturas", "quadros"]) {
        if (!db.objectStoreNames.contains(loja)) db.createObjectStore(loja, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("config")) db.createObjectStore("config");
      // da prova de conceito: virou "capturas"
      if (db.objectStoreNames.contains("pendentes")) db.deleteObjectStore("pendentes");
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function operar(loja, modo, acao) {
  const db = await abrir();
  try {
    return await new Promise((ok, falha) => {
      const tx = db.transaction(loja, modo);
      const req = acao(tx.objectStore(loja));
      tx.oncomplete = () => ok(typeof req === "function" ? req() : req.result);
      tx.onerror = tx.onabort = () => falha(tx.error);
    });
  } finally {
    db.close();
  }
}

export const obter = (loja, chave) => operar(loja, "readonly", (s) => s.get(chave));
// sem `chave` numa loja autoIncrement, devolve a chave gerada
export const gravar = (loja, valor, chave) => operar(loja, "readwrite", (s) => s.put(valor, chave));
export const apagar = (loja, chave) => operar(loja, "readwrite", (s) => s.delete(chave));

// Todos os registros, com a chave em `id`.
export const listar = (loja) => operar(loja, "readonly", (s) => {
  const valores = s.getAll();
  const chaves = s.getAllKeys();
  return () => valores.result.map((v, i) => ({ ...v, id: chaves.result[i] }));
});
