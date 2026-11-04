import React, { useState } from 'react';
import JSZip from 'jszip';
import { Download, Database, Package, Loader2 } from 'lucide-react';

export function DownloadApp() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  function triggerDownloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleDownloadPackageZip(type: 'instalacao' | 'atualizacao') {
    const key = type === 'instalacao' ? 'install-zip' : 'update-zip';
    setDownloading(key);
    setDownloadSuccess(null);
    setDownloadError(null);

    const endpoints = [
      type === 'instalacao' ? '/api/deploy/download-instalacao-zip' : '/api/deploy/download-atualizacao-zip',
      type === 'instalacao' ? '/api.php?action=deploy/download-instalacao-zip' : '/api.php?action=deploy/download-atualizacao-zip',
      type === 'instalacao' ? '/buscapreco_instalacao_completa.zip' : '/buscapreco_pacote_atualizacao.zip',
    ];

    let downloaded = false;
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep);
        if (res.ok) {
          const blob = await res.blob();
          const archive = await JSZip.loadAsync(blob, { checkCRC32: true });
          const files = Object.keys(archive.files);
          const required = ['index.html', 'api.php', 'config.php', 'install.php', '.htaccess'];
          if (required.every((name) => archive.file(name)) &&
              files.some((name) => name.startsWith('assets/') && name.endsWith('.js')) &&
              !files.some((name) => /\.(zip|bat|ps1|exe|cmd)$/i.test(name))) {
            triggerDownloadBlob(
              blob,
              type === 'instalacao' ? 'buscapreco_instalacao_completa.zip' : 'buscapreco_pacote_atualizacao.zip'
            );
            downloaded = true;
            break;
          }
        }
      } catch {}
    }

    if (!downloaded) {
      setDownloadError('Não foi possível obter um pacote completo para Hostinger. Gere e publique os pacotes atualizados antes de baixar.');
      setDownloading(null);
      return;
    }

    setDownloadSuccess(key);
    setTimeout(() => setDownloadSuccess(null), 4000);
    setDownloading(null);
  }


  async function downloadAgent() {
    setDownloading('agent');
    setDownloadError(null);
    setDownloadSuccess(null);
    try {
      const zip = new JSZip();
      for (const file of ['integrador.mjs', 'runtime.mjs', 'configure-windows.mjs', 'config.example.json', 'LEIA-ME.txt']) {
        const response = await fetch(`/erp-agent/${file}`);
        if (!response.ok) throw new Error('Kit indisponível. Atualize os arquivos da hospedagem.');
        const text = await response.text();
        if (text.trimStart().startsWith('<')) throw new Error('A hospedagem retornou uma página em lugar do kit.');
        zip.file(file, text);
      }
      triggerDownloadBlob(await zip.generateAsync({ type: 'blob' }), 'integrador-vr-postgresql.zip');
      setDownloadSuccess('agent');
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Falha ao baixar o integrador.');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 text-neutral-100">
      <header>
        <h2 className="text-2xl font-bold">Instalação e integração VR</h2>
        <p className="text-neutral-400 mt-2">Publique o aplicativo na Hostinger e instale o integrador no servidor Windows da loja.</p>
      </header>
      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4">
          <h3 className="font-bold flex gap-2 items-center"><Package /> Aplicativo para Hostinger</h3>
          <p className="text-sm text-neutral-300">Inclui a interface, API PHP e receptor da carga do ERP. Faça backup antes de atualizar e preserve o config_db.json existente.</p>
          {(['instalacao', 'atualizacao'] as const).map((type) => (
            <button key={type} disabled={downloading !== null} onClick={() => handleDownloadPackageZip(type)}
              className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold flex gap-2 items-center justify-center">
              {downloading === (type === 'instalacao' ? 'install-zip' : 'update-zip') ? <Loader2 className="animate-spin" /> : <Download />}
              {type === 'instalacao' ? 'Baixar instalação completa' : 'Baixar atualização'}
            </button>
          ))}
          <p className="text-xs text-neutral-400">Na primeira instalação, copie config_db.example.txt para config_db.json e preencha MySQL e token. Configure o administrador no primeiro acesso e, depois de entrar, execute install.php. O pacote não contém suas credenciais.</p>
        </section>
        <section className="rounded-2xl border border-neutral-700 bg-neutral-900 p-6 space-y-4">
          <h3 className="font-bold flex gap-2 items-center"><Database /> Integrador VR / PostgreSQL</h3>
          <p className="text-sm text-neutral-300">Roda no servidor Windows e consulta o VR com um usuário de leitura. A conexão de saída usa HTTPS; não exponha o PostgreSQL na Internet.</p>
          <ol className="list-decimal pl-5 text-sm text-neutral-300 space-y-2">
            <li>Instale o Node.js 22 LTS ou posterior e extraia o kit.</li>
            <li>Execute <code>npm install pg@8.23.1 --save-exact</code> na pasta do kit.</li>
            <li>Copie config.example.json para config.json e configure banco, loja e situação ativa do VR.</li>
            <li>Defina o mesmo token aleatório no kit e no campo erp_sync_token do config_db.json da Hostinger; use erp_sync_loja para autorizar a loja.</li>
            <li>Teste com <code>node integrador.mjs --once</code>. Confira o total confirmado e consulte um produto na nuvem.</li>
          </ol>
          <button disabled={downloading !== null} onClick={downloadAgent}
            className="w-full px-4 py-3 rounded-xl bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 font-semibold flex gap-2 items-center justify-center">
            {downloading === 'agent' ? <Loader2 className="animate-spin" /> : <Download />} Baixar kit do integrador VR
          </button>
          <p className="text-xs text-neutral-400">O LEIA-ME explica a configuração. Não compartilhe o config.json preenchido. O integrador não tenta senhas padrão nem cria tarefas automaticamente.</p>
        </section>
      </div>
      {downloadSuccess && <p role="status" className="text-emerald-400">Arquivo gerado para download. Confirme a conclusão no navegador.</p>}
      {downloadError && <p role="alert" className="text-red-400">{downloadError}</p>}
      <p className="text-xs text-neutral-400">Mantenha o antivírus e a verificação HTTPS ativos. Se houver detecção, interrompa a instalação e guarde os detalhes para análise.</p>
    </div>
  );
}
