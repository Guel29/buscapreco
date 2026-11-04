export async function adminAuth(operation: 'status' | 'login' | 'setup' | 'logout' | 'change-password', data: Record<string, string> = {}) {
  for (const url of ['/auth.php', '/api/auth']) {
    const response = await fetch(url, operation === 'status' ? { credentials: 'same-origin', cache: 'no-store' } : {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, ...data }),
    });
    if (!(response.headers.get('content-type') || '').includes('application/json')) continue;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível autenticar.');
    return result as { configured?: boolean; authenticated?: boolean; success?: boolean };
  }
  throw new Error('Autenticação indisponível. Atualize os arquivos do servidor.');
}
