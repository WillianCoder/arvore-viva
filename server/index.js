import { criarServidor } from './app.js';
import { config } from './config.js';

const srv = criarServidor();
srv.listen(config.port, () => console.log(`Árvore Viva rodando em http://localhost:${config.port}`));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => srv.close(() => process.exit(0)));
