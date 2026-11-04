# Integrador completo como serviço do Windows

O arquivo `BuscaPrecoIntegrador-Setup.exe` inclui Node.js 24 LTS para Windows x64,
o driver PostgreSQL e o integrador VR. Não exige instalar Node.js ou npm na loja.

## Instalação

1. Use Windows 10 a partir da build 17763, Windows 11 ou Windows Server 2019+,
   de 64 bits. Confira o novo instalador com o Defender, mantendo a proteção ativa.
2. Execute o instalador como administrador. A elevação é necessária apenas para
   instalar e administrar o serviço, não para as cargas automáticas.
3. Informe a URL HTTPS do busca-preço na Hostinger, o token do receptor ERP,
   ID da loja e intervalo de atualização. O padrão é 10 minutos.
4. Informe servidor, porta, banco, usuário de leitura e senha do PostgreSQL do VR.
   Confirme a situação de cadastro ativa com o responsável pelo VR. O exemplo usa 3.
   Marque TLS do PostgreSQL somente se o banco estiver configurado com certificado
   válido. A conexão com a Hostinger sempre usa HTTPS verificado.
5. Mantenha marcada **Iniciar como serviço ao ligar o computador, sem login**.
6. Conclua. O instalador não inicia uma carga imediatamente. Na próxima
   inicialização do Windows, o serviço fará isso automaticamente, antes do login.

O serviço **Busca Preço - Integrador VR** usa a conta restrita **LocalService**.
Não depende de login no Windows, de login no painel, de navegador aberto ou de uma
janela do terminal. Também não depende da conta do usuário que fez a instalação.
As credenciais de leitura do PostgreSQL e o token são configurados uma vez e ficam
protegidos no computador. O painel web continua com senha própria de administração.

Se o PostgreSQL ou a rede ainda não estiverem disponíveis ao ligar a máquina, o
agente tentará novamente após um minuto. Após uma carga confirmada, ele respeita
o intervalo escolhido. O Windows pode reiniciar o serviço se o processo falhar;
um comando normal de parada não reinicia o serviço automaticamente.
O PostgreSQL do VR também precisa estar em execução para haver atualização. Se o
banco só inicia quando alguém abre o ERP, confirme a inicialização automática do
PostgreSQL com o suporte do VR; este instalador não altera os serviços do ERP.

## Conferir antes de reiniciar o servidor da loja

Para um teste controlado, abra **Serviços do Windows**, procure o serviço pelo
nome e escolha **Iniciar**. Consulte o atalho **Ver logs** no menu Iniciar e
compare um EAN e seu preço com o VR. Não é necessário reiniciar o servidor no
horário de funcionamento para fazer esse teste opcional.

Os programas ficam em `%ProgramFiles%\BuscaPrecoIntegrador`. A configuração e
os logs ficam em `%ProgramData%\BuscaPrecoIntegrador`. O instalador restringe a
configuração a Administradores, SYSTEM e LocalService. Os logs têm leitura
disponível para usuários locais e não incluem senhas ou tokens.

`logs\status.json` mostra a última confirmação ou o código da última falha;
`logs\integrador.log` possui uma rotação para não crescer indefinidamente. Uma
falha não significa que a nuvem foi atualizada: só uma confirmação completa conta
como sucesso. O catálogo anterior é preservado em cargas incompletas.

## Alterar e remover

Para mudar os dados, execute novamente o instalador como administrador e desmarque
**Manter a configuração existente**. Também é possível editar o `config.json`
como administrador com o serviço parado. Reinicie o serviço após a alteração.
Uma reconfiguração cria `config.backup.json`, que também contém segredos: não
compartilhe esse arquivo, o `config.json` ou `.agent-control.json`.

Para interromper atualizações, pare o serviço pelo gerenciador de Serviços. Para
remover, use **Aplicativos instalados → Busca Preço - Integrador VR → Desinstalar**.
O desinstalador para e remove o serviço e os atalhos, removendo a inicialização
automática. Ele pergunta se deseja apagar a configuração e os logs; por padrão,
preserva esses dados para uma reinstalação.

## Compilação e limites da validação

`npm run build:windows` gera o instalador e seu arquivo SHA-256. A compilação usa
Linux, Docker, Python 3 e NSIS/MinGW instalados por pacotes assinados do Debian.
O Node oficial tem versão e checksum fixados em `installer/windows/node-release.json`;
o build confere o manifesto oficial e o SHA-256 do download antes de usá-lo.
As dependências usam `npm ci` com lockfile, sem executar scripts de instalação.

Os testes locais cobrem configuração, caracteres especiais de senha, uma única
instância, parada por canal local autenticado e rotação de logs. O serviço usa o
Service Control Manager do Windows; não usa a pasta Inicializar nem a chave Run.
A conta LocalService não precisa receber uma senha de usuário do Windows.

Em teste de compatibilidade com Wine, uma instalação com configuração previamente
preparada registrou o serviço com início Automático e conta LocalService, executou
o Node incluído, iniciou/parou o agente e desinstalou preservando a configuração.
Esse teste não valida a inicialização de um Windows real nem suas permissões NTFS.

O instalador não tem assinatura digital. Compilar, conferir hashes ou executar
testes de compatibilidade não substitui a validação no Windows real da loja nem
a verificação do Defender. Em caso de detecção, interrompa e preserve os detalhes;
não desative o antivírus, não crie exclusões e não reduza políticas de segurança.
