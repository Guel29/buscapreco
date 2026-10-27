# Sistema de Consulta de Preços & Gerenciamento de Lojas e Terminais

Sistema completo de consulta de preços para terminais de consulta (busca-preço), PDV e painel administrativo, com suporte a integração remota Hostinger (MySQL / PHP), gerenciamento de impressoras térmicas (Argox, Zebra, Elgin) e múltiplos terminais.

---

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+ ou 20+
- npm ou bun

### Instalação
```bash
npm install
```

### Desenvolvimento
```bash
npm run dev
```
Inicia o servidor Express integrado ao Vite na porta `3000`.

### Compilação de Produção
```bash
npm run build
```
Gera os arquivos otimizados em `dist/`.

### Verificação de Tipos
```bash
npm run lint
```
Executa `tsc --noEmit` para garantir 0 erros de tipagem TypeScript.

---

## 📁 Estrutura do Projeto

```text
├── src/
│   ├── components/
│   │   ├── ConsultaPreco.tsx          # Interface principal do busca-preço (limpa, sanitiza '_', modal de impressão de etiquetas)
│   │   ├── PainelAdmin.tsx            # Painel administrativo central com abas (Produtos, Lojas, Terminais, Impressoras, Hostinger)
│   │   ├── GerenciadorImpressoras.tsx # CRUD completo de impressoras térmicas e de rede
│   │   ├── TerminaisLojas.tsx         # Gestão de terminais com limpeza de terminais simulados/não-reais
│   │   ├── SincronizacaoHostinger.tsx # Ferramenta de teste e sincronização com banco MySQL na Hostinger
│   │   └── GerenciadorProdutos.tsx    # Cadastro e listagem de produtos com filtro por código interno e EAN
│   ├── services/
│   │   ├── api.ts                     # Camada de comunicação com a API (Node / PHP Hostinger)
│   │   ├── storage.ts                 # Armazenamento e fallback local
│   │   └── argoxPrinter.ts            # Gerador de comandos térmicos (PPLA, PPLB, ZPL, ESC/POS)
│   ├── types/
│   │   └── index.ts                   # Tipos TypeScript (Produto, Loja, Terminal, PrinterConfig)
│   ├── App.tsx                        # Roteamento e orquestração dos módulos
│   └── main.tsx                       # Ponto de entrada React
├── public/
│   ├── api.php                        # API backend para hospedagem Hostinger (MySQL)
│   ├── atualizar_produtos.php         # Endpoint PHP de recepção de arquivos e sincronização de produtos
│   └── printers_config.json           # Armazenamento de configurações de impressoras
├── schema_hostinger_mysql.sql         # Script SQL para criar as tabelas no MySQL da Hostinger
├── server.ts                          # Servidor full-stack Express com proxy e APIs locais
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🛠️ Principais Recursos Implementados

1. **Consulta de Preços Otimizada**:
   - Tratamento e sanitização de scanners de código de barras que inserem prefixo `_` no início do EAN.
   - Busca estrita por Código de Barras (EAN) e Código Interno.
   - Top bar minimalista exibindo apenas o nome da loja ativa com backdrop blur.

2. **Impressão de Etiquetas**:
   - Botão direto `[ 🖨️ Imprimir Etiqueta ]` e atalhos rápidos (`P` e `F9`) no busca-preço.
   - Modal com preview em tempo real de etiqueta 100x30mm, código de barras gerado via JsBarcode.
   - Envio para impressoras de rede via socket TCP/IP ou impressão térmica do navegador.

3. **Gerenciamento de Impressoras**:
   - Cadastro com nome, IP, porta (padrão 9100), modelo (Argox OS-214, Zebra ZPL, Elgin L42, Epson ESC/POS).

4. **Gerenciamento de Lojas e Terminais**:
   - Exclusão segura de lojas com realocação automática de produtos e terminais associados.
   - Botão para remover terminais que não sejam reais (terminais de teste/simulados).

5. **Hostinger / MySQL**:
   - Script SQL pronto para importação (`schema_hostinger_mysql.sql`).
   - Arquivos PHP (`api.php` e `atualizar_produtos.php`) para hospedar no `public_html` da Hostinger.
