# Entrega Hostinger e VR/PostgreSQL

O navegador consulta a API PHP/MySQL na Hostinger. Um agente Node.js instalado no
servidor Windows da loja lê o PostgreSQL do VR e envia uma carga por HTTPS a cada
10 minutos. O agente não altera o VR, não procura senhas conhecidas e não executa
scripts recebidos da Internet.

## Publicar na Hostinger

1. Faça backup dos arquivos e do MySQL existentes. Gere os pacotes com `npm run build`.
2. Extraia `public/buscapreco_instalacao_completa.zip` na raiz do domínio, com
   `index.html`, `assets/`, `.htaccess` e os PHP no mesmo nível. Requer Apache 2.4,
   PHP 8.3 com `pdo_mysql` e `mbstring`, MySQL/MariaDB e HTTPS válido.
3. Preserve o `config_db.json` existente. Em uma instalação nova, copie
   `config_db.example.txt` para `config_db.json` no gerenciador da Hostinger.
   Preencha `host`, `port`, `database`, `user` e `password` com os dados do MySQL.
4. Gere um token aleatório de 32 bytes localmente e guarde-o com segurança. Por
   exemplo, em uma pasta privada do servidor Windows:

   ```sh
   node -e "require('fs').writeFileSync('token.txt',require('crypto').randomBytes(32).toString('hex'),{flag:'wx'})"
   ```

   Copie o valor para `erp_sync_token` do `config_db.json`. Defina `erp_sync_loja`
   com o ID da loja autorizada. Não publique tokens nem credenciais no GitHub,
   em capturas ou em mensagens. Remova o arquivo temporário depois de guardar o
   valor nas configurações necessárias.
5. Abra o aplicativo e o painel com **Ctrl+F12**. No primeiro acesso, escolha uma
   senha com pelo menos 10 caracteres e informe o token de configuração. Esse
   procedimento só funciona enquanto não existe administrador. As senhas são
   armazenadas como hash no servidor; o token não é uma senha alternativa de login.
6. Depois de entrar no painel, abra `/install.php?format=json` em uma instalação
   nova. O instalador cria as tabelas sem substituir o nome de uma loja existente.
7. Confirme que `/config_db.json` retorna **403** e que uma sessão sem login não
   consegue alterar produtos ou acessar a configuração do banco. Use a nova senha
   para entrar; `1234` e `admin` não concedem acesso especial.

Uma atualização preserva configurações e dados, mas a nova proteção exige criar
o administrador antes de usar as operações do painel. O painel fica bloqueado
se o token/senha ainda não foram configurados; isso não impede consultas públicas.

## Instalar o integrador no Windows da loja

1. No painel, use **Instalação e integração VR → Baixar kit do integrador VR**.
   Instale Node.js 22 LTS ou posterior a partir do site oficial.
2. Extraia em uma pasta restrita e execute `npm install pg@8.23.1 --save-exact`.
3. Copie `config.example.json` para `config.json`. Configure o endereço HTTPS,
   o mesmo token da Hostinger, a loja e a conexão PostgreSQL com usuário de leitura.
   Não abra a porta do PostgreSQL na Internet.
4. Confirme com o responsável pelo VR o código da situação **ativa** — o exemplo
   usa `3` — e os nomes das tabelas/colunas. A consulta de referência usa
   `produtoautomacao`, `produto`, `produtocomplemento` e `tipoembalagem`.
5. Execute `node integrador.mjs --once`. Confira o total confirmado na nuvem e
   consulte um EAN conhecido, comparando o preço com o VR.
6. Execute `node integrador.mjs` para repetir a carga a cada 10 minutos. Mantenha
   apenas um agente por loja. Se desejar iniciar com o Windows, configure a tarefa
   conscientemente no Agendador usando `node.exe` e a pasta do kit.

O VR passa a ser a fonte do catálogo da loja configurada: no fim de uma carga
completa, produtos ausentes são inativados na nuvem. Uma extração vazia é recusada
para impedir o apagamento por configuração incorreta. Lotes interrompidos não
alteram o catálogo; cargas antigas não substituem uma carga mais recente. Consulte
os códigos `HTTP_401`, `HTTP_403` e `HTTP_409` no terminal para diagnosticar token,
loja e carga recusada, sem registrar senhas em logs.

## O que foi validado

- Autenticação, configuração inicial, troca de senha e bloqueio de APIs sem sessão.
- Leitura PostgreSQL com usuário limitado a SELECT e transação READ ONLY.
- Envio em lotes, confirmação completa, alteração de preço, inativação de ausentes
  e preservação do catálogo em falha, entrada inválida ou carga fora de ordem.
- Consulta PHP por EAN, prefixo de scanner, zeros à esquerda e código interno.
- Uma resposta online de produto inativo/não encontrado prevalece sobre o cache
  antigo; o cache é usado quando os serviços ficam indisponíveis.
- Compilação, tipos, testes de regressão e navegação em Chromium: consulta, login
  e download do kit.

`npm run test:hostinger` recria os serviços de teste em Docker com dados fictícios.
`npm test` executa os testes locais e pula a integração caso não haja serviços
configurados. Os testes não fazem nenhuma conexão com o VR da loja.

## Validação pendente no local

Antes de colocar os terminais em operação, valide a conexão no Windows real,
compatibilidade da consulta com a versão do VR, loja/situação corretas, HTTPS,
permissões na Hostinger e comparação de preços. Impressão física não foi validada.
O estado de agente online no painel significa uma carga VR confirmada nos últimos
20 minutos, não uma sondagem contínua do PostgreSQL.

O pacote anterior foi bloqueado pelo Defender como `Trojan:Script/Ulthar.A!ml`.
O antigo gerador híbrido BAT/PowerShell foi removido da interface; o novo agente
tem código explícito e não reduz políticas de execução ou verificação TLS. Isso
não comprova ausência de malware: faça a verificação do novo ZIP no Defender antes
de instalar. Se ele detectar uma ameaça, interrompa a instalação e preserve o
nome do arquivo, hash e detalhes da detecção. Não desative o antivírus.
