/**
 * Utilitários de Data e Hora no Horário de Brasília (America/Sao_Paulo / UTC-3)
 * Garante que tanto no servidor quanto no navegador o fuso horário exibido seja sempre o oficial de Brasília.
 */

export const BRAZIL_TIMEZONE = 'America/Sao_Paulo';

export function formatDateTimeBR(dateOrIso: string | number | Date | null | undefined): string {
  if (!dateOrIso) return 'Não realizada';
  try {
    const d = new Date(dateOrIso);
    if (isNaN(d.getTime())) return 'Data inválida';
    return d.toLocaleString('pt-BR', {
      timeZone: BRAZIL_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Data inválida';
  }
}

export function formatTimeBR(dateOrIso: string | number | Date | null | undefined): string {
  if (!dateOrIso) return '--:--:--';
  try {
    const d = new Date(dateOrIso);
    if (isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString('pt-BR', {
      timeZone: BRAZIL_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

export function formatDateBR(dateOrIso: string | number | Date | null | undefined): string {
  if (!dateOrIso) return '--/--/----';
  try {
    const d = new Date(dateOrIso);
    if (isNaN(d.getTime())) return '--/--/----';
    return d.toLocaleDateString('pt-BR', {
      timeZone: BRAZIL_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '--/--/----';
  }
}
