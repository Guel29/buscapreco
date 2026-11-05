# Fundo do terminal e Argox USB

O fundo é salvo no IndexedDB do navegador deste terminal. A atualização migra o fundo antigo do localStorage, confirma a gravação antes de mudar a imagem e avisa se não houver espaço ou permissão. Trocar de computador, perfil ou domínio exige configurar o fundo nesse terminal. Limpar os dados do site remove a configuração.

Para atualizar a hospedagem, extraia `atualizacao_terminal_fundo_etiquetas.zip` em `public_html/buscapreco`, substituindo index.html e os assets incluídos. Esse arquivo não contém configurações privadas nem altera o banco. Atualize o navegador com Ctrl+F5.

Para Argox USB, abra o Busca Preço no computador fisicamente conectado à impressora, com o driver instalado no Windows. Consulte um produto, escolha Imprimir Etiqueta e Imprimir pelo Windows / Argox USB. No diálogo escolha a Argox, papel 100 × 30 mm, escala 100%, margens nenhuma e cabeçalhos/rodapés desativados. Defina as cópias nesse diálogo. O formato contém descrição, preço e código de barras Code128.

O serviço de sincronização VR não é um serviço de impressão. O botão de impressão direta requer um agente local separado; não alcança o USB de outro computador. Esta atualização oferece impressão pelo driver do Windows com diálogo. Para imprimir a partir de outro computador, a impressora precisa estar compartilhada e instalada nele, ou ser usado um serviço de impressão apropriado.

Verificação: lint, suíte de testes e build; Chromium confirmou imagem acima de 5 MiB persistida após recarga, falha simulada de gravação preservando a imagem anterior, restauração persistida e impressão isolada com código de barras. PDF inspecionado: uma página de aproximadamente 100 × 30 mm, com texto do produto e sem o painel. Impressão física depende do driver e da impressora da loja e não foi executada neste ambiente.
