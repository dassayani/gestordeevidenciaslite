# Gestor de Evidências Lite

Extensão para Google Chrome que captura, anota e transforma prints em
documentos de evidência de teste, em PDF, sem sair do navegador.

![Versão](https://img.shields.io/badge/versão-0.2.0-0B7285)
![Chrome](https://img.shields.io/badge/Chrome-122%2B-17262E)
![Manifest](https://img.shields.io/badge/Manifest-V3-17262E)
![Dados](https://img.shields.io/badge/dados-100%25%20locais-0CA678)

---

## Sobre

Evidência de teste costuma nascer espalhada: o print vai para uma pasta
qualquer, a legenda fica num bloco de notas e a montagem do documento é um
trabalho manual de colar, redimensionar e numerar.

O Gestor de Evidências Lite faz esse caminho inteiro dentro do Chrome:

1. **Captura** uma área da aba ou de qualquer tela, por atalho ou botão.
2. **Anota** a imagem com seta, desfoque e tarja, e escreve a legenda.
3. **Gera o documento** em um de três modelos, com capa preenchida e passos
   numerados.

**Para quem:** QA, analistas de teste, suporte e quem precisa entregar
evidência de execução com frequência.

**Onde os dados ficam:** tudo é local. Não há servidor, conta, telemetria nem
envio de nada para fora da máquina.

---

## Funcionalidades

**Captura**

- Área da aba atual, com a página congelada no instante do atalho: menus
  abertos e tooltips continuam no print
- Área de qualquer tela (outros programas, outro monitor), com atalho que
  funciona mesmo com o Chrome em segundo plano
- Captura direta para a área de trabalho, sem janela no meio

**Área de trabalho**

- O popup da extensão mostra as imagens do dia, com navegação por data e
  calendário
- Um clique seleciona a imagem para o documento; dois cliques abrem a edição
- Indicador de imagens que ainda não foram gravadas na pasta

**Editor**

- Seta, Borrar (desfoque) e Tarja (bloco sólido para dado sensível)
- Cinco cores, desfazer (Ctrl+Z) e atalhos de teclado para as ferramentas
- Legenda por imagem
- O original é preservado: a anotação pode ser refeita a qualquer momento

**Documento**

- Três modelos: **Passo a passo**, **Ficha de evidência** e **Relatório QA**
- Capa com título, caso/projeto, ambiente, autor e data
- Ordem cronológica por padrão, com opção de inverter e ajuste fino por setas
- Imagens padronizadas para o PDF não crescer sem necessidade
- Nome do arquivo gerado a partir da capa: `Título - Caso - Ambiente.pdf`

**Armazenamento**

- Pasta local escolhida pelo usuário, com três arquivos por captura
  (imagem, original e metadados)
- A captura nunca espera pela pasta: fica guardada na extensão e é gravada
  assim que houver permissão

---

## Modos de captura

| | Área desta aba | Qualquer tela |
|---|---|---|
| **Atalho padrão** | `Alt+1` | `Ctrl+Shift+1` (global) |
| **Captura** | A página visível da aba ativa | Qualquer monitor, qualquer programa |
| **Permissão** | Nenhuma | Seletor "Compartilhar tela" do Chrome, uma vez por sessão |
| **Indicação na tela** | Nenhuma | Aba fixada "Modo Tela" e a barra de compartilhamento do Chrome |
| **Não captura** | Páginas internas (`chrome://`, Web Store) e a barra de endereço | Conteúdo protegido por DRM |

Quando a aba não pode ser capturada, a extensão avisa o motivo e oferece usar
a captura de tela.

---

## Instalação

### Pré-requisitos

- Google Chrome 122 ou superior (ou outro navegador baseado em Chromium)
- Windows 10 ou 11

### Carregar a extensão

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions`.
3. Ative o **Modo do desenvolvedor**, no canto superior direito.
4. Clique em **Carregar sem compactação** e escolha a pasta do repositório.
5. Fixe o ícone da extensão na barra do Chrome.

Na primeira execução, a extensão abre a tela de Configurações para escolher a
pasta das capturas. Quando o Chrome pedir permissão para gravar nela, escolha
**Permitir em todas as visitas**.

### Atualizar

Depois de baixar uma versão nova, clique em ↻ no cartão da extensão em
`chrome://extensions`.

---

## Uso

### Capturar

Aperte o atalho ou abra o popup e clique em **Área desta aba** ou **Qualquer
tela**. A tela congela escurecida: arraste para selecionar a área. Um clique
sem arrastar captura a área inteira; `Esc` cancela.

Na primeira captura de tela, o Chrome pergunta qual monitor compartilhar. As
seguintes são imediatas enquanto a aba fixada "Modo Tela" estiver aberta.

### Editar

No popup, dê dois cliques na imagem.

| Tecla | Ação |
|---|---|
| `S` | Seta |
| `B` | Borrar |
| `T` | Tarja |
| `Ctrl+Z` | Desfazer |

**Concluir** grava a imagem anotada e a legenda.

### Gerar o documento

1. No popup, clique uma vez em cada imagem que entra no documento.
2. Clique em **Gerar documento**.
3. Escolha o modelo, preencha a capa e confira a ordem.
4. Clique em **Gerar PDF**.

O PDF é gravado na pasta das capturas. Sem pasta configurada, vai para
Downloads. Autor, ambiente e modelo ficam lembrados para o próximo documento.

### Atalhos

Os atalhos podem ser trocados em `chrome://extensions/shortcuts`, ou pelo link
em Configurações.

- Só atalhos `Ctrl+Shift+número` funcionam com outro programa em primeiro
  plano (marcados como **Global**).
- `Ctrl+número` não funciona: o Chrome usa essa combinação para trocar de aba.
- A tecla Print Screen não pode ser usada por extensões.

---

## Como as capturas são guardadas

Cada captura gera três arquivos na pasta escolhida:

```
print_20261030_143052.png        imagem com as anotações aplicadas
print_20261030_143052.raw.png    original sem anotação, para reeditar
print_20261030_143052.json       metadados
```

Duas capturas no mesmo segundo recebem sufixo (`_2`, `_3`); nenhuma
sobrescreve outra.

O `.json`:

```json
{
  "caption": "Tela de confirmação do pedido",
  "caso": "",
  "edited_at": "2026-10-30T14:31:10",
  "captured_at": "2026-10-30T14:30:52",
  "shapes": [
    { "tool": "seta", "coords": [120, 80, 340, 210], "color": "#E8590C",
      "width": 4, "dash": false, "visible": true, "estilo": "afinada" }
  ],
  "origem": { "url": "https://exemplo.com/pedido", "titulo": "Pedido" }
}
```

| Campo | Significado |
|---|---|
| `caption` | Legenda da imagem |
| `caso` | Reservado; o caso/projeto é informado só no documento |
| `captured_at` | Instante da captura; é ele que ordena o documento |
| `edited_at` | Última anotação na imagem (legenda não conta) |
| `shapes` | Anotações, em pixels da imagem original |
| `origem` | Página de onde veio o print (só na captura de aba) |

---

## Permissões

| Permissão | Para que serve |
|---|---|
| `activeTab`, `scripting` | Capturar a aba atual e mostrar a seleção de área sobre ela |
| `desktopCapture` | Capturar qualquer tela |
| `system.display` | Abrir a seleção no monitor que foi capturado |
| `storage`, `unlimitedStorage` | Guardar as capturas na extensão até irem para a pasta |
| `notifications` | Avisar quando uma captura não pôde ser feita |

A extensão não acessa a rede.

---

## Segurança e privacidade

Print de evidência é onde dado de cliente costuma vazar sem querer: CPF, nome,
e-mail, token na URL.

- Nada sai da máquina: sem upload, sem conta, sem telemetria.
- A **Tarja** cobre a região com um bloco sólido gravado na própria imagem.
  É a ferramenta indicada para dado sensível.
- O **Borrar** desfoca a região. Em texto pequeno, desfoque pode ser revertido
  em parte; para CPF, senha ou token, use a Tarja.
- O arquivo `.raw.png` guarda o original **sem anotação**, com o dado visível,
  para permitir reeditar. Ao compartilhar a pasta de capturas, e não só o PDF,
  leve isso em conta.
- Se a pasta escolhida estiver sincronizada com a nuvem (OneDrive, Google
  Drive), as capturas sobem junto.

---

## Tecnologias

| Camada | O que usa |
|---|---|
| Plataforma | Chrome Extension, Manifest V3 |
| Linguagem | JavaScript (módulos ES), sem etapa de build |
| Interface | HTML e CSS com tokens visuais próprios |
| Captura | `chrome.tabs.captureVisibleTab`, `chrome.desktopCapture` |
| Armazenamento | IndexedDB e File System Access API |
| Documento | [jsPDF](https://github.com/parallax/jsPDF) 2.5.1, incluído no repositório |

---

## Arquitetura

```
           atalho / popup
                 │
                 ▼
         background.js  (service worker)
          │                       │
   Área desta aba            Qualquer tela
          │                       │
   captureVisibleTab        tela/  aba fixada que mantém
   + content/seletor.js           o compartilhamento
          │                       │
          │                 selecao/  janela em tela cheia
          │                       │   com content/seletor.js
          └──────────┬────────────┘
                     ▼
              lib/capturas.js ──► IndexedDB (capturas)
                     │
                     ▼
               lib/pasta.js  ──► pasta escolhida (png + raw.png + json)

   popup/ ── área de trabalho ──► captura/  (editor)
                              └─► documento/ ──► lib/pdf.js ──► PDF
```

Toda captura é gravada primeiro no IndexedDB da extensão e depois espelhada na
pasta. Assim a captura nunca falha por falta de pasta ou de permissão: o que
estiver pendente vai para a pasta no próximo clique que a autorize.

---

## Estrutura do projeto

```
.
├── manifest.json            declaração da extensão, permissões e atalhos
├── background.js            service worker: atalhos, captura da aba, avisos
│
├── popup/                   área de trabalho (imagens do dia, seleção)
├── captura/                 editor de anotação
├── documento/               gerar documento
├── config/                  configurações: pasta e atalhos
├── tela/                    aba fixada do modo Qualquer tela
├── selecao/                 seleção de área em tela cheia
├── content/
│   └── seletor.js           seleção de área sobre o quadro congelado
│
├── lib/
│   ├── capturas.js          capturas, seleção e sincronia com a pasta
│   ├── pasta.js             gravação dos arquivos na pasta
│   ├── idb.js               acesso ao IndexedDB
│   ├── imagem.js            recorte e miniatura
│   ├── anotacoes.js         desenho das anotações
│   ├── pdf.js               os três modelos de documento
│   ├── janelas.js           janelas do editor, documento e seleção
│   └── vendor/              jsPDF
│
├── estilos/tokens.css       cores, espaçamentos e fontes
└── icones/
```

---

## Limitações conhecidas

- A barra "compartilhando sua tela" do Chrome não pode ser ocultada por
  extensões enquanto o modo Qualquer tela estiver ativo.
- Fechar a aba fixada "Modo Tela" encerra o compartilhamento; a próxima
  captura de tela pede o monitor de novo.
- Com o Chrome em segundo plano, o Windows pode apenas piscar o ícone na barra
  de tarefas em vez de trazer a seleção para a frente.

---

## Roadmap

### Pronto

- [x] Captura da aba e de qualquer tela, com atalhos
- [x] Área de trabalho no popup, com navegação por data
- [x] Editor com seta, desfoque, tarja, cores e desfazer
- [x] Documento em PDF nos três modelos
- [x] Pasta local com sincronia automática

### Próximo

- [ ] Editor: quadro, texto, passo numerado e recorte
- [ ] Documento em DOCX
- [ ] Limpeza automática por tempo de retenção

---

## Contribuindo

Cada mudança nasce numa branch própria:

```bash
git checkout -b feature/nome-curto
```

Prefixos de branch: `feature/`, `fix/`, `refactor/`, `docs/`.
Convenção de commit: `feat:` · `fix:` · `perf:` · `refactor:` · `docs:` · `chore:`

Para mudanças de interface, carregue a extensão e confira a tela no Chrome.
Atalhos globais e o seletor de compartilhamento só se testam com teclado e
mouse de verdade.

---

## Licença

**Todos os direitos reservados**. Ver [LICENSE](LICENSE).

O código está visível publicamente para consulta e avaliação, o que não
concede licença de uso, cópia ou modificação.

O jsPDF, incluído em `lib/vendor/`, é distribuído sob a licença MIT pelos seus
autores.

## Responsável

Dasayani, desenvolvimento e QA.
