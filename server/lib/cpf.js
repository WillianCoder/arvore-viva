// CPF: validação matemática apenas. Validar não confirma a identidade de ninguém.
export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

export function cpfValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

// Máscara para telas comuns: ***.***.*89-01 vira só os 2 últimos dígitos visíveis.
export function mascarar(tipo, ultimos) {
  if (!ultimos) return '••••';
  if (tipo === 'cpf') return `•••.•••.•••-${ultimos.slice(-2)}`;
  return `••••${ultimos.slice(-2)}`;
}
