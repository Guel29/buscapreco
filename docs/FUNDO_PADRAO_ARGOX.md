# Argox OS-214 Plus USB e fundo padrão do site

Extraia a atualização na pasta public_html/buscapreco, substituindo os arquivos incluídos. Preserve config_db.json, .erp-schedule.json, .terminal-background.json e a pasta terminal-media existentes. O pacote não contém credenciais nem dados de usuários. Atualize o navegador com Ctrl+F5.

## Etiquetas

No computador ligado por USB à Argox, consulte um produto, abra Imprimir Etiqueta e escolha Imprimir na Argox OS-214 Plus pelo Windows. O aplicativo imprime um documento separado contendo apenas a etiqueta, sem incluir o painel ou o fundo do terminal. O documento é de 100 × 30 mm e contém produto, preço e código de barras Code128.

No diálogo selecione a Argox OS-214 Plus instalada, papel 100 × 30 mm, escala 100%, sem margens e sem cabeçalhos/rodapés. Defina as cópias no diálogo. Se a impressora usa ribbon, configure transferência térmica nas preferências do driver Argox. O fato de imprimir pelo VR confirma a comunicação física; o driver gráfico do Windows ainda precisa estar configurado para a impressão pelo navegador. A impressão física depende do computador da loja.

A impressão USB principal abre o driver do Windows. Impressão RAW depende de um agente local que confirme o trabalho. O aplicativo não anuncia entrega à impressora através da Hostinger e não considera HTML ou uma resposta sem confirmação como sucesso do agente.

## Fundo compartilhado

Entre pelo F8, abra Fundo do Terminal, carregue o PNG/JPG/WebP desejado e clique Salvar como fundo padrão do site. PNG, JPG e WebP são aceitos, até 6 MB. A imagem é validada e armazenada na hospedagem. Outros navegadores sem fundo personalizado passam a usá-la ao abrir ou atualizar o site; sessões abertas consultam alterações a cada minuto. Um fundo personalizado de um terminal continua tendo preferência. Restaurar Fundo Padrão remove essa preferência local.

A prévia enviada pelo chat não foi disponibilizada como arquivo original no ambiente de desenvolvimento. Para deixar exatamente aquela arte como padrão, faça o upload dela nesse painel; para incluí-la diretamente no pacote, envie o arquivo PNG/JPG original ao desenvolvimento. Este pacote adiciona o recurso de padrão compartilhado, mas não contém uma reprodução da arte enviada.

## Verificação

Lint, suíte de testes e build passaram. PHP/MySQL validou bloqueio de uploads sem administrador, rejeição de SVG/conteúdo inválido, leitura pública da imagem e proteção do manifesto. Chromium confirmou o fundo em um navegador novo sem login e impressão USB sem requisições de impressão à nuvem. O PDF do documento isolado contém uma única página de aproximadamente 100 × 30 mm com dados e barras da etiqueta, sem interface do terminal. Não foi executada impressão física na Argox da loja.
