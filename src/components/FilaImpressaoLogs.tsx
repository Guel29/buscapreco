import React, { useState, useEffect } from 'react';
import { PrintJob, SystemLog } from '../types';
import { Printer, RefreshCw, RotateCcw, CheckCircle2, AlertCircle, FileText } from 'lucide-react';

export const FilaImpressaoLogs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'impressao' | 'sistema'>('impressao');
  const [printLogs, setPrintLogs] = useState<PrintJob[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reprintMessage, setReprintMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/print/logs'),
        fetch('/api/logs'),
      ]);
      if (pRes.ok) setPrintLogs(await pRes.json());
      if (sRes.ok) setSystemLogs(await sRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReprint = async (job: PrintJob) => {
    try {
      const res = await fetch('/api/print/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminal_id: job.terminal_id,
          modelo_id: job.modelo_id,
          modelo_nome: job.modelo_nome,
          impressora_id: job.impressora_id,
          produtos: job.produtos,
          comandos_raw: job.comandos_raw,
        }),
      });
      if (res.ok) {
        setReprintMessage(`✓ Etiqueta reenviada com sucesso para impressão!`);
        loadData();
        setTimeout(() => setReprintMessage(null), 3000);
      }
    } catch {
      setReprintMessage('Falha ao reenviar impressão.');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 text-neutral-100">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-400" />
            Logs & Fila de Impressão
          </h2>
          <p className="text-sm text-neutral-400">
            Histórico completo de trabalhos de impressão e eventos operacionais.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-neutral-900 p-1 rounded-xl border border-neutral-800">
          <button
            onClick={() => setActiveTab('impressao')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'impressao'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Fila de Impressão ({printLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('sistema')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'sistema'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Logs do Sistema ({systemLogs.length})
          </button>
        </div>
      </div>

      {reprintMessage && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {reprintMessage}
        </div>
      )}

      {activeTab === 'impressao' ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800">
              <tr>
                <th className="p-3">Data / Hora</th>
                <th className="p-3">Terminal</th>
                <th className="p-3">Modelo</th>
                <th className="p-3">Produto 1</th>
                <th className="p-3">Produto 2 (Etiqueta Dupla)</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {printLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-neutral-500 font-sans">
                    Nenhum trabalho de impressão registrado ainda.
                  </td>
                </tr>
              ) : (
                printLogs.map((job) => (
                  <tr key={job.id} className="hover:bg-neutral-800/40">
                    <td className="p-3 text-neutral-400 whitespace-nowrap">
                      {new Date(job.data_hora).toLocaleTimeString('pt-BR')}
                    </td>
                    <td className="p-3 text-neutral-300">{job.terminal_id}</td>
                    <td className="p-3 text-neutral-300 font-bold">{job.modelo_nome}</td>
                    <td className="p-3">
                      {job.produtos[0] ? (
                        <div>
                          <span className="text-white font-sans font-semibold">
                            {job.produtos[0].descricao}
                          </span>
                          <div className="text-[10px] text-emerald-400">
                            R$ {Number(job.produtos[0].preco).toFixed(2)} · Cód: {job.produtos[0].codigo_interno}
                          </div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3">
                      {job.produtos[1] ? (
                        <div>
                          <span className="text-white font-sans font-semibold">
                            {job.produtos[1].descricao}
                          </span>
                          <div className="text-[10px] text-amber-400">
                            R$ {Number(job.produtos[1].preco).toFixed(2)} · Cód: {job.produtos[1].codigo_interno}
                          </div>
                        </div>
                      ) : (
                        <span className="text-neutral-600 italic">Etiqueta simples</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {job.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleReprint(job)}
                        className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] font-semibold flex items-center gap-1 ml-auto cursor-pointer"
                        title="Reimprimir Etiqueta"
                      >
                        <RotateCcw className="w-3 h-3 text-emerald-400" />
                        <span>Reimprimir</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-950 text-neutral-400 font-semibold border-b border-neutral-800">
              <tr>
                <th className="p-3">Data / Hora</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {systemLogs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-800/40">
                  <td className="p-3 text-neutral-400 whitespace-nowrap">
                    {new Date(log.data_hora).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-300">
                      {log.tipo}
                    </span>
                  </td>
                  <td className="p-3 text-neutral-200 font-sans">{log.mensagem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
