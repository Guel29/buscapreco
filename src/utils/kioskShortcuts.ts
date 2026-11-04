export function kioskShortcut(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'repeat'>): 'admin' | 'labels' | null {
  if (event.repeat || event.altKey || event.shiftKey) return null;
  const f8 = event.key === 'F8' || event.code === 'F8';
  const f12 = event.key === 'F12' || event.code === 'F12';
  if (f8 && !event.ctrlKey && !event.metaKey) return 'admin';
  if ((event.ctrlKey || event.metaKey) && f12) return 'admin';
  if ((event.ctrlKey || event.metaKey) && f8) return 'labels';
  return null;
}
