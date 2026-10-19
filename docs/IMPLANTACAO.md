# Implantação, configuração, backup e restauração

## Requisitos
- Node.js **22.13+** (usa o SQLite embutido `node:sqlite`).
- Um proxy com **HTTPS** na frente (Caddy, Nginx ou o balanceador do provedor).
- Disco persistente para a pasta `data/`.

## Variáveis de ambiente (`.env`)

| Variável | Obrigatória em produção | Descrição |
|---|---|---|
| `PORT` | não (3000) | Porta HTTP interna |
| `DATA_DIR` | sim | Pasta do banco (`arvore.db`) e dos arquivos (`arquivos/`) |
| `ENCRYPTION_KEY` | **sim** | 64 caracteres hex (32 bytes). Criptografa CPF/RG e arquivos. Gere: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Sem ela os dados criptografados ficam ilegíveis — guarde em cofre de senhas.** |
| `COOKIE_SECURE` | **sim** (`true`) | Envia o cookie só por HTTPS |
| `ADMIN_EMAILS` | recomendado | E-mails (vírgula) com acesso à Administração técnica |

Nunca envie o `.env` ao GitHub (já está no `.gitignore`).

## Passo a passo (servidor Linux)

```bash
git clone <este repositório> arvore-viva && cd arvore-viva
npm ci --omit=dev
cp .env.example .env   # preencha as variáveis acima
npm run migrate        # cria/atualiza o banco
npm start
```

Exemplo de serviço systemd (`/etc/systemd/system/arvore-viva.service`):

```ini
[Unit]
Description=Arvore Viva
After=network.target
[Service]
WorkingDirectory=/opt/arvore-viva
EnvironmentFile=/opt/arvore-viva/.env
ExecStart=/usr/bin/npm start
Restart=always
User=arvore
[Install]
WantedBy=multi-user.target
```

Exemplo de Caddy (HTTPS automático):

```
arvore.seudominio.com.br {
  reverse_proxy 127.0.0.1:3000
}
```

## Backup

- Automático pela interface: **Administração técnica → Criar backup agora** (gera `backups/arvore-AAAA-MM-DD….db` com `VACUUM INTO`, seguro com o sistema rodando).
- Pela linha de comando: `npm run backup` (agende no cron, ex.: diariamente).
- **Copie junto** a pasta `DATA_DIR/arquivos/` (documentos criptografados) e guarde a `ENCRYPTION_KEY` separadamente.
- Mantenha cópias fora do servidor e criptografadas (ex.: armazenamento de objetos privado).

## Restauração

1. Pare o serviço.
2. Copie o arquivo de backup para `DATA_DIR/arvore.db` (apague `arvore.db-wal` e `arvore.db-shm` se existirem).
3. Restaure `DATA_DIR/arquivos/`.
4. Confirme que a `ENCRYPTION_KEY` é a mesma da época do backup.
5. `npm run migrate` e inicie o serviço.

## Retenção

- Exclusões de pessoas, vínculos, eventos e documentos são lógicas (recuperáveis pela administração).
- Exclusão de árvore e de conta são definitivas. Arquivos sem documento podem ser removidos em **Administração técnica → Limpar arquivos órfãos**.
- Defina com seu jurídico o prazo de guarda dos backups (LGPD); backups antigos também precisam ser eliminados.

## Monitoramento

- Erros inesperados vão para a saída padrão (`[erro] MÉTODO caminho …`) sem dados sensíveis; use o journal/serviço de logs do provedor.
- `GET /api/health` responde `{ "ok": true }` para checagem de disponibilidade.

## Integrações externas

| Integração | Situação | O que precisa |
|---|---|---|
| Mapas (OpenStreetMap tiles) | Funcionando, sem chave | Para uso intenso, contrate um provedor de tiles e troque a URL em `public/js/views/mapa.js` e na CSP (`server/http.js`) |
| Three.js / Leaflet | Funcionando, servidos localmente | — |
| Texto de PDF (`pdftotext`) | Funciona se o pacote `poppler-utils` estiver instalado | `apt install poppler-utils` |
| OCR de imagens | **Não configurado** | Instalar Tesseract e implementar a chamada em `server/routes/documentos.js` (rota `extract`) |
| E-mail (convites, recuperação, verificação) | **Não configurado** | Servidor SMTP/serviço transacional; hoje os links são copiados manualmente |
| Autenticação multifator | **Não implementada** | Ver FUNCIONALIDADES.md |
| Fontes genealógicas externas | Catálogo de links oficiais, **sem integração automática** | Só integrar com API oficial e autorização |
