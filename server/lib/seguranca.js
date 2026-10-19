// Senhas, tokens e criptografia de dados sensíveis.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

function carregarChave() {
  if (/^[0-9a-f]{64}$/i.test(config.encryptionKey)) return Buffer.from(config.encryptionKey, 'hex');
  // Desenvolvimento: gera uma chave local fora do repositório.
  const arq = path.join(config.dataDir, '.chave');
  if (!fs.existsSync(arq)) {
    fs.writeFileSync(arq, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    console.warn('[seguranca] ENCRYPTION_KEY ausente: chave local criada em', arq, '(defina ENCRYPTION_KEY em produção)');
  }
  return Buffer.from(fs.readFileSync(arq, 'utf8').trim(), 'hex');
}
const chaveMestra = carregarChave();
const derivar = (rotulo) => crypto.createHmac('sha256', chaveMestra).update(rotulo).digest();
const chaveCifra = derivar('cifra-v1');
const chaveHmac = derivar('hmac-identificadores-v1');

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sal.toString('hex')}$${h.toString('hex')}`;
}
export function conferirSenha(senha, armazenado) {
  const [alg, sal, h] = String(armazenado).split('$');
  if (alg !== 'scrypt' || !sal || !h) return false;
  const calc = crypto.scryptSync(senha, Buffer.from(sal, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}

export const tokenAleatorio = (n = 32) => crypto.randomBytes(n).toString('base64url');
export const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
export const hmacIdentificador = (tipo, valor) => crypto.createHmac('sha256', chaveHmac).update(`${tipo}:${valor}`).digest('hex');

export function cifrar(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chaveCifra, iv);
  const dados = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]);
}
export function decifrar(buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', chaveCifra, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}
export const cifrarTexto = (t) => cifrar(Buffer.from(t, 'utf8')).toString('base64');
export const decifrarTexto = (b) => decifrar(Buffer.from(b, 'base64')).toString('utf8');
