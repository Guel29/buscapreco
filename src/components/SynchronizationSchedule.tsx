import React, { useEffect, useState } from 'react';

export function SynchronizationSchedule({ storeId }: { storeId: number }) {
  const [minutes, setMinutes] = useState('10');
  const [saved, setSaved] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setReady(false);
    fetch('/api/erp/schedule', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data.success || data.id_loja !== storeId) throw new Error();
      if (active) {
        setSaved(data.intervalo_minutos);
        setMinutes(String(data.intervalo_minutos ?? 10));
        setReady(true);
      }
    }).catch(() => { if (active) setMessage('Não foi possível carregar o intervalo desta loja. Entre no painel ou atualize os arquivos da hospedagem.'); });
    return () => { active = false; };
  }, [storeId]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(minutes);
    if (!Number.isInteger(value) || value < 1 || value > 1440) { setMessage('Informe um número inteiro de 1 a 1440 minutos.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/erp/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_loja: storeId, intervalo_minutos: value }) });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || 'Não foi possível salvar.');
      setSaved(data.intervalo_minutos);
      setMessage('Intervalo salvo. O integrador 1.0.2 ou superior aplica a mudança no próximo contato com a nuvem, em cerca de um minuto enquanto aguarda o próximo ciclo.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
    <h3 className="font-bold text-white">Intervalo da sincronização automática</h3>
    <p className="text-sm text-neutral-400">{saved === null ? 'O integrador usa o intervalo local até você salvar um valor aqui.' : `Intervalo salvo: a cada ${saved} minuto(s).`}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-neutral-300">Intervalo em minutos
        <input type="number" min="1" max="1440" step="1" required value={minutes} disabled={!ready || busy}
          onChange={(event) => setMinutes(event.target.value)} className="block mt-1 w-36 rounded-lg bg-neutral-950 border border-neutral-700 p-2 text-white" />
      </label>
      <button type="submit" disabled={!ready || busy} className="rounded-lg px-4 py-2 bg-emerald-600 text-white font-bold disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar intervalo'}</button>
    </div>
    <p className="text-xs text-neutral-400">De 1 minuto a 24 horas. Requer integrador Windows 1.0.2 ou superior. Uma carga em andamento termina normalmente; em caso de falha, o integrador tenta novamente após um minuto.</p>
    <p role="status" className="text-sm text-emerald-300">{message}</p>
  </form>;
}
