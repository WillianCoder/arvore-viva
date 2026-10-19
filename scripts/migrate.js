import { migrar } from '../server/db.js';
const feitas = migrar();
console.log(feitas.length ? `Migrações aplicadas: ${feitas.join(', ')}` : 'Banco já está atualizado.');
