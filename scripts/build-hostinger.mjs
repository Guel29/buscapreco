import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHostingerPackage } from './hostinger-package.mjs';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('../', import.meta.url));
const buffer = await createHostingerPackage(root);
for (const name of ['buscapreco_instalacao_completa.zip', 'buscapreco_pacote_atualizacao.zip']) {
  await fs.writeFile(new URL(`../public/${name}`, import.meta.url), buffer);
  // Vite copies public/ before this step; refresh the copies it serves as well.
  await fs.writeFile(new URL(`../dist/${name}`, import.meta.url), buffer);
  console.log(`${name}: ${buffer.length} bytes`);
}
const agent = new JSZip();
for (const name of ['integrador.mjs', 'config.example.json', 'LEIA-ME.txt']) {
  agent.file(name, await fs.readFile(new URL(`../public/erp-agent/${name}`, import.meta.url)));
}
const kit = await agent.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
for (const folder of ['public', 'dist']) {
  await fs.writeFile(new URL(`../${folder}/integrador_vr_postgresql.zip`, import.meta.url), kit);
}
console.log(`integrador_vr_postgresql.zip: ${kit.length} bytes`);
