// Monta o servidor HTTP (usado pelo index.js e pelos testes).
import http from 'node:http';
import path from 'node:path';
import { Router, criarHandler } from './http.js';
import { antes } from './acesso.js';
import { migrar } from './db.js';
import { config } from './config.js';
import { rotasAuth } from './routes/auth.js';
import { rotasArvores } from './routes/arvores.js';
import { rotasPessoas } from './routes/pessoas.js';
import { rotasDocumentos } from './routes/documentos.js';
import { rotasAnalise } from './routes/analise.js';
import { rotasPortabilidade } from './routes/portabilidade.js';
import { rotasAdmin } from './routes/admin.js';
import { rotasDemo } from './routes/demo.js';

export function criarServidor() {
  migrar();
  const r = new Router();
  r.get('/api/health', () => ({ ok: true }), { publica: true });
  for (const f of [rotasAuth, rotasArvores, rotasPessoas, rotasDocumentos, rotasAnalise, rotasPortabilidade, rotasAdmin, rotasDemo]) f(r);
  const nm = path.join(config.raiz, 'node_modules');
  const estaticos = [
    ['/vendor/three/', path.join(nm, 'three', 'build')],
    ['/vendor/leaflet/', path.join(nm, 'leaflet', 'dist')],
    ['/', path.join(config.raiz, 'public')],
  ];
  return http.createServer(criarHandler({ router: r, antes, estaticos }));
}
