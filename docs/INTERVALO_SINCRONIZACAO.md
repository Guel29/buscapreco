# Intervalo central da sincronização VR

Atualize a Hostinger extraindo `atualizacao_sincronizacao_admin.zip` em `public_html/buscapreco`, substituindo os arquivos do pacote. Preserve config_db.json e os demais arquivos de dados existentes. O pacote não inclui credenciais. Atualize o navegador com Ctrl+F5.

No servidor Windows da loja, execute BuscaPrecoIntegrador-Setup-1.0.2.exe como administrador com Manter a configuração existente marcado. O instalador preserva as credenciais, loja, situação ativa e demais configurações. Depois da instalação, abra services.msc e inicie Busca Preço - Integrador VR. O serviço permanece automático no boot, sem login.

No site, entre pelo F8 e abra Sincronizador & Carga. Defina Intervalo em minutos (1 a 1440) e Salvar intervalo. A configuração é persistida separadamente em .erp-schedule.json, protegido pelo Apache. Os campos e ações de administração ficam fora da janela de consulta, que mostra somente conexão, loja, data/hora da carga, ativos, inativos e total.

O integrador 1.0.2 lê o intervalo da nuvem usando o token ERP, restrito à loja autorizada. Esse token não pode editar o intervalo. Ao aguardar o próximo ciclo, o integrador verifica alterações a cada minuto, sem reinício e sem sobrepor cargas. O intervalo conta a partir da conclusão da carga anterior. Uma carga em andamento termina normalmente. Falhas continuam sendo tentadas a cada minuto. Sem configuração central, o intervalo local da instalação vale; sem comunicação com a nuvem, permanece o último intervalo válido em memória (no boot sem acesso à nuvem, usa o local).

Testes: validação de limites/tipos/loja, bloqueio de edição por token e por visitante, proteção de origem, persistência entre requisições, preservação da autenticação e privacidade do arquivo em PHP/MySQL; cálculo do próximo ciclo ao encurtar ou ampliar o intervalo; integração PostgreSQL → PHP/MySQL; interface no Chromium (salvar/recarregar; consulta sem ações de alteração, mesmo com sessão administrativa). Atualização 1.0.1 → 1.0.2 verificada no Wine preservando configuração e serviço automático; boot real do Windows depende da instalação da loja.
