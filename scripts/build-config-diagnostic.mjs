import fs from 'node:fs/promises';
import JSZip from 'jszip';
const zip = new JSZip();
zip.file('verificar-configuracao.php', await fs.readFile(new URL('../public/verificar-configuracao.php', import.meta.url)));
await fs.writeFile(new URL('../public/diagnostico_configuracao_hostinger.zip', import.meta.url),
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
