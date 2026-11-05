import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const backendFiles = [
  'api.php', 'config.php', 'config_db.example.txt', 'index.php', 'install.php', 'auth.php', 'auth-session.php',
  'atualizar_app.php', 'atualizar_produtos.php', 'erp-sync.php', 'erp-schedule.php', '.htaccess', 'schema_buscapreco.sql',
];

export async function createHostingerPackage(root) {
  const zip = new JSZip();
  // Select deployment files explicitly. dist also contains copies of public/,
  // including old archives and Windows helpers that do not belong on Hostinger.
  zip.file('index.html', await fs.readFile(path.join(root, 'dist/index.html')));
  async function addAssets(directory, prefix) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const source = path.join(directory, item.name);
      const target = `${prefix}/${item.name}`;
      if (item.isDirectory()) await addAssets(source, target);
      else if (item.isFile() && /\.(js|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$/i.test(item.name)) {
        zip.file(target, await fs.readFile(source));
      } else throw new Error(`Arquivo inesperado nos assets: ${target}`);
    }
  }
  await addAssets(path.join(root, 'dist/assets'), 'assets');
  for (const file of backendFiles) {
    zip.file(file, await fs.readFile(path.join(root, 'public', file)));
  }
  for (const file of ['integrador.mjs', 'runtime.mjs', 'configure-windows.mjs', 'config.example.json', 'LEIA-ME.txt']) {
    zip.file(`erp-agent/${file}`, await fs.readFile(path.join(root, 'public/erp-agent', file)));
  }
  zip.file('LEIA-ME.txt', `INSTALAÇÃO NA HOSTINGER
Faça backup dos arquivos e do banco existentes antes de atualizar.
Extraia na pasta do domínio: index.html, assets/, api.php e .htaccess devem ficar na raiz.
Preserve o config_db.json existente: o pacote não inclui credenciais ou dados locais.
Copie config_db.example.txt para config_db.json e preencha o MySQL com os dados da Hostinger.
Gere um token aleatório de 32 bytes (veja erp-agent/LEIA-ME.txt) e salve em erp_sync_token.
Abra o painel, configure a senha do administrador usando esse token e entre com a nova senha.
Em uma instalação nova, execute /install.php após entrar. O receptor do ERP usa erp_sync_loja para autorizar a loja.
Este pacote é exclusivo para hospedagem PHP. Os agentes Windows são distribuídos separadamente.
Verifique o arquivo com seu antivírus antes de instalar. Não desative a proteção.
`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}
