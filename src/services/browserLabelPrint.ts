/** Print an isolated document: the kiosk, dialogs and artwork never enter it. */
export function printBrowserLabel(source: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Impressão de etiqueta Argox OS-214 Plus';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:100mm;height:30mm;border:0;';
    const label = source.cloneNode(true) as HTMLElement;
    label.className = '';
    label.style.cssText = 'box-sizing:border-box;width:100mm;height:30mm;padding:2mm;overflow:hidden;background:white;color:black;font-family:Arial,sans-serif;';
    let cleanupTimer: ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(cleanupTimer); frame.remove(); };
    frame.onload = async () => {
      try {
        const target = frame.contentWindow;
        if (!target) throw new Error('Documento de impressão indisponível.');
        await target.document.fonts.ready;
        target.addEventListener('afterprint', () => setTimeout(cleanup, 500), { once: true });
        target.focus();
        target.print();
        // Some browsers do not dispatch afterprint for subframes.
        cleanupTimer = setTimeout(cleanup, 300000);
        resolve();
      } catch (error) { cleanup(); reject(error); }
    };
    frame.srcdoc = '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Etiqueta 100 x 30 mm</title><style>@page{size:100mm 30mm;margin:0}html,body{margin:0;padding:0;width:100mm;height:30mm;background:white;color:black;overflow:hidden}*{box-sizing:border-box}svg{display:block}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>' + label.outerHTML + '</body></html>';
    document.body.appendChild(frame);
  });
}
