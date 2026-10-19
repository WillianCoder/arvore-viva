import { migrar } from '../server/db.js';
import { fazerBackup } from '../server/routes/admin.js';
migrar();
console.log('Backup criado em', fazerBackup());
console.log('Lembre-se de copiar também data/arquivos e guardar a ENCRYPTION_KEY em local seguro.');
