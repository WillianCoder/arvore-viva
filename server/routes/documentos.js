// Documentos (arquivos criptografados), vínculos, fontes, citações, evidências e extração assistida.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { all, get, run, tx, uuid } from '../db.js';
import { erro } from '../http.js';
import { papelNaArvore, pessoaNaArvore, pode, exigirEdicao, auditar, texto, opcao, dataParcial, exigirUuid, urlSegura } from '../acesso.js';
import { salvarLocal, local } from '../servicos.js';
import { cifrar, decifrar, sha256 } from '../lib/seguranca.js';
import { config } from '../config.js';
import { extrairDados } from '../lib/extracao.js';

const pastaArquivos = path.join(config.dataDir, 'arquivos');
fs.mkdirSync(pastaArquivos, { recursive: true });

export const CATEGORIAS_DOC = ['birth_cert', 'marriage_cert', 'death_cert', 'identity', 'photo', 'letter', 'religious', 'immigration', 'military', 'inventory', 'will', 'newspaper', 'notary', 'other'];
const VERIF = ['declared', 'extracted', 'documented', 'confirmed', 'contested', 'hypothesis'];

// Confere o tipo REAL do arquivo pelos primeiros bytes (não confia na extensão).
export function tipoReal(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

const nivelPermitido = (papel) => (pode(papel, 'admin') ? ['tree', 'editors', 'owner'] : pode(papel, 'editor') ? ['tree', 'editors'] : ['tree']);

function docAcessivel(treeId, id, papel) {
  const d = get('SELECT * FROM documents WHERE id = ? AND tree_id = ? AND deleted_at IS NULL', id, treeId);
  if (!d || !nivelPermitido(papel).includes(d.access_level)) throw erro(404, 'Documento não encontrado.');
  return d;
}

function lerMeta(b, atual = {}) {
  const v = (k, f) => (b[k] !== undefined ? f(b[k]) : k in atual ? atual[k] : f(undefined));
  return {
    title: v('title', (x) => texto(x, { campo: 'Título', max: 250, obrigatorio: true })),
    category: v('category', (x) => opcao(x, CATEGORIAS_DOC, 'other', 'Categoria')),
    doc_date: v('doc_date', (x) => dataParcial(x, 'Data do documento')),
    institution: v('institution', (x) => texto(x, { campo: 'Instituição', max: 250 })),
    author: v('author', (x) => texto(x, { campo: 'Autor', max: 250 })),
    reference: v('reference', (x) => texto(x, { campo: 'Referência', max: 250 })),
    page: v('page', (x) => texto(x, { campo: 'Página', max: 250 })),
    url: v('url', (x) => urlSegura(x, 'URL da fonte')),
    accessed_at: v('accessed_at', (x) => dataParcial(x, 'Data de acesso')),
    notes: v('notes', (x) => texto(x, { campo: 'Observações', max: 5000 })),
    transcription: v('transcription', (x) => texto(x, { campo: 'Transcrição', max: 100000 })),
    verification: v('verification', (x) => opcao(x, VERIF, 'declared', 'Verificação')),
    access_level: v('access_level', (x) => opcao(x, ['tree', 'editors', 'owner'], 'tree', 'Nível de acesso')),
    place_id: b.place !== undefined ? salvarLocal(b.place) : atual.place_id ?? null,
  };
}

const assinar = (dados) => crypto.createHmac('sha256', sha256('url-temporaria:' + config.dataDir)).update(dados).digest('base64url');

export function removerArquivosOrfaos() {
  const usados = new Set(all('SELECT storage_key FROM documents WHERE storage_key IS NOT NULL').map((r) => r.storage_key));
  let n = 0;
  for (const f of fs.readdirSync(pastaArquivos)) if (!usados.has(f)) { fs.rmSync(path.join(pastaArquivos, f), { force: true }); n++; }
  return n;
}

export function rotasDocumentos(r) {
  r.get('/api/trees/:treeId/documents', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const niveis = nivelPermitido(papel);
    const cond = ['d.tree_id = ?', 'd.deleted_at IS NULL', `d.access_level IN (${niveis.map(() => '?').join(',')})`];
    const args = [t, ...niveis];
    if (ctx.query.category) { cond.push('d.category = ?'); args.push(ctx.query.category); }
    if (ctx.query.person_id) { cond.push('d.id IN (SELECT document_id FROM document_links WHERE person_id = ?)'); args.push(ctx.query.person_id); }
    if (ctx.query.q) { cond.push('(d.title LIKE ? OR d.reference LIKE ? OR d.institution LIKE ?)'); const q = `%${ctx.query.q}%`; args.push(q, q, q); }
    const limite = Math.min(100, Number(ctx.query.limit) || 50), offset = Math.max(0, Number(ctx.query.offset) || 0);
    const total = get(`SELECT COUNT(*) n FROM documents d WHERE ${cond.join(' AND ')}`, ...args).n;
    const docs = all(`SELECT d.id, d.title, d.category, d.doc_date, d.verification, d.access_level, d.mime, d.size, d.reference, d.institution, d.is_demo, d.updated_at,
      (SELECT COUNT(*) FROM document_links WHERE document_id = d.id) vinculos FROM documents d WHERE ${cond.join(' AND ')} ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`, ...args, limite, offset);
    return { total, documentos: docs };
  });

  // Cria documento (metadados) com arquivo opcional em base64.
  r.post('/api/trees/:treeId/documents', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'contributor');
    const m = lerMeta(ctx.body);
    const id = uuid();
    let arquivo = { storage_key: null, mime: null, size: null, sha256: null, original_name: null };
    if (ctx.body.file_base64) {
      if (typeof ctx.body.file_base64 !== 'string') throw erro(400, 'Arquivo inválido.');
      const buf = Buffer.from(ctx.body.file_base64, 'base64');
      if (!buf.length) throw erro(400, 'Arquivo vazio.');
      if (buf.length > config.maxUploadBytes) throw erro(413, `Arquivo maior que ${config.maxUploadBytes / 1048576} MB.`);
      const mime = tipoReal(buf);
      if (!mime) throw erro(415, 'Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP.');
      const chave = `${uuid()}.bin`;
      fs.writeFileSync(path.join(pastaArquivos, chave), cifrar(buf), { mode: 0o600 });
      arquivo = { storage_key: chave, mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), original_name: texto(ctx.body.file_name, { max: 200 }).replace(/[^\w.\- À-ÿ]/g, '_') };
    }
    // Documento ligado a pessoa viva: restrito a editores por padrão.
    const pessoas = Array.isArray(ctx.body.person_ids) ? ctx.body.person_ids.slice(0, 50).map((p) => pessoaNaArvore(t, exigirUuid(p, 'Pessoa'))) : [];
    if (ctx.body.access_level === undefined && pessoas.some((p) => p.living_status === 'living')) m.access_level = 'editors';
    tx(() => {
      run(`INSERT INTO documents (id, tree_id, title, category, doc_date, place_id, institution, author, reference, page, url, accessed_at, notes, transcription, verification, access_level, storage_key, mime, size, sha256, original_name, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, t, m.title, m.category, m.doc_date, m.place_id, m.institution, m.author, m.reference, m.page, m.url, m.accessed_at, m.notes, m.transcription,
      m.verification, m.access_level, arquivo.storage_key, arquivo.mime, arquivo.size, arquivo.sha256, arquivo.original_name, ctx.user.id);
      for (const p of pessoas) run('INSERT INTO document_links (id, document_id, person_id) VALUES (?,?,?)', uuid(), id, p.id);
      auditar(ctx, t, 'documento.criado', 'document', id, m.category);
    });
    return { status: 201, body: { id, mime: arquivo.mime } };
  }, { maxBody: 15 * 1024 * 1024 });

  r.get('/api/trees/:treeId/documents/:id', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const d = docAcessivel(t, ctx.params.id, papel);
    const vinculos = all(`SELECT dl.id, dl.note, dl.person_id, dl.relationship_id, dl.event_id, p.full_name, p.living_status, p.visibility, p.created_by,
      r.type rel_type, r.person_a, r.person_b, e.type event_type FROM document_links dl LEFT JOIN persons p ON p.id = dl.person_id
      LEFT JOIN relationships r ON r.id = dl.relationship_id LEFT JOIN life_events e ON e.id = dl.event_id WHERE dl.document_id = ?`, d.id)
      .map((v) => {
        const privado = v.person_id && (v.living_status === 'living' || v.visibility === 'private') && !pode(papel, 'editor') && v.created_by !== ctx.user.id;
        const nome = (id) => get('SELECT full_name FROM persons WHERE id = ?', id)?.full_name;
        return { id: v.id, note: v.note, person_id: v.person_id, relationship_id: v.relationship_id, event_id: v.event_id, pessoa: privado ? 'Pessoa viva (privado)' : v.full_name,
          relacao: v.relationship_id ? { type: v.rel_type, a: nome(v.person_a), b: nome(v.person_b) } : null, evento: v.event_type };
      });
    const citacoes = all(`SELECT c.id, c.page, c.quote, s.id source_id, s.title FROM source_citations c JOIN sources s ON s.id = c.source_id WHERE c.document_id = ?`, d.id);
    const historico = all(`SELECT a.action, a.created_at, u.name autor FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.entity = 'document' AND a.entity_id = ? ORDER BY a.created_at DESC LIMIT 50`, d.id);
    const { storage_key, ...pub } = d;
    return { documento: { ...pub, tem_arquivo: !!storage_key, place: local(d.place_id) }, vinculos, citacoes, historico, papel };
  });

  r.patch('/api/trees/:treeId/documents/:id', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const d = docAcessivel(t, ctx.params.id, papel);
    exigirEdicao(ctx, papel, d.created_by);
    if (ctx.body.access_level === 'owner' && !pode(papel, 'admin')) throw erro(403, 'Só administradores restringem um documento ao nível "proprietário".');
    const m = lerMeta(ctx.body, d);
    run(`UPDATE documents SET title=?, category=?, doc_date=?, place_id=?, institution=?, author=?, reference=?, page=?, url=?, accessed_at=?, notes=?, transcription=?, verification=?, access_level=?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, m.title, m.category, m.doc_date, m.place_id, m.institution, m.author, m.reference, m.page, m.url, m.accessed_at, m.notes, m.transcription,
    m.verification, m.access_level, d.id);
    auditar(ctx, t, 'documento.editado', 'document', d.id);
    return { ok: true };
  });

  r.delete('/api/trees/:treeId/documents/:id', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'editor');
    const d = docAcessivel(t, ctx.params.id, papel);
    tx(() => {
      run(`UPDATE documents SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, d.id);
      run('UPDATE persons SET photo_document_id = NULL WHERE photo_document_id = ?', d.id);
      auditar(ctx, t, 'documento.excluido', 'document', d.id);
    });
    return { ok: true };
  });

  // URL temporária (5 min) assinada; o download ainda exige sessão e permissão.
  r.post('/api/trees/:treeId/documents/:id/file-url', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const d = docAcessivel(t, ctx.params.id, papel);
    if (!d.storage_key) throw erro(404, 'Este documento não tem arquivo anexado.');
    const exp = Date.now() + 5 * 60000;
    const dados = `${t}.${d.id}.${ctx.user.id}.${exp}`;
    return { url: `/api/files/${Buffer.from(dados).toString('base64url')}.${assinar(dados)}`, expira: new Date(exp).toISOString() };
  });

  r.get('/api/files/:token', (ctx) => {
    const [b64, sig] = String(ctx.params.token).split('.');
    const dados = Buffer.from(b64 || '', 'base64url').toString();
    const esperado = assinar(dados);
    if (!sig || sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) throw erro(403, 'Link inválido.');
    const [t, id, uid, exp] = dados.split('.');
    if (Number(exp) < Date.now()) throw erro(410, 'Link expirado. Abra o documento novamente.');
    if (uid !== ctx.user.id) throw erro(403, 'Link emitido para outra conta.');
    const papel = papelNaArvore(ctx, t);
    const d = docAcessivel(t, id, papel);
    const buf = decifrar(fs.readFileSync(path.join(pastaArquivos, d.storage_key)));
    return { raw: buf, headers: { 'Content-Type': d.mime, 'Content-Length': buf.length, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", 'Content-Disposition': `inline; filename="documento${path.extname(d.original_name || '') || ''}"` } };
  });

  // ---- Vínculos documento ↔ pessoa / relação / evento ----
  r.post('/api/trees/:treeId/documents/:id/links', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const d = docAcessivel(t, ctx.params.id, papel);
    const b = ctx.body;
    let person_id = null, relationship_id = null, event_id = null;
    if (b.person_id) person_id = pessoaNaArvore(t, exigirUuid(b.person_id)).id;
    if (b.relationship_id) { const r2 = get('SELECT id FROM relationships WHERE id = ? AND tree_id = ? AND deleted_at IS NULL', exigirUuid(b.relationship_id), t); if (!r2) throw erro(404, 'Vínculo não encontrado.'); relationship_id = r2.id; }
    if (b.event_id) { const e = get('SELECT id FROM life_events WHERE id = ? AND tree_id = ? AND deleted_at IS NULL', exigirUuid(b.event_id), t); if (!e) throw erro(404, 'Evento não encontrado.'); event_id = e.id; }
    if (!person_id && !relationship_id && !event_id) throw erro(400, 'Escolha uma pessoa, vínculo ou evento.');
    const id = uuid();
    tx(() => {
      run('INSERT INTO document_links (id, document_id, person_id, relationship_id, event_id, note) VALUES (?,?,?,?,?,?)', id, d.id, person_id, relationship_id, event_id, texto(b.note, { max: 500 }));
      // Vincular um documento a uma relação registra a evidência correspondente.
      if (relationship_id && b.as_evidence !== false) {
        run(`INSERT INTO evidence_items (id, tree_id, target_type, target_id, document_id, kind, stance, note, created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
          uuid(), t, 'relationship', relationship_id, d.id, 'documented', b.contradicts ? -1 : 1, texto(b.note, { max: 500 }), ctx.user.id);
      }
      auditar(ctx, t, 'documento.vinculado', 'document', d.id);
    });
    return { status: 201, body: { id } };
  });

  r.delete('/api/trees/:treeId/documents/:id/links/:lid', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'editor');
    const d = docAcessivel(t, ctx.params.id, papel);
    run('DELETE FROM document_links WHERE id = ? AND document_id = ?', ctx.params.lid, d.id);
    auditar(ctx, t, 'documento.desvinculado', 'document', d.id);
    return { ok: true };
  });

  // Extração assistida: texto do PDF (pdftotext, se instalado) ou transcrição digitada → sugestões para revisão.
  r.post('/api/trees/:treeId/documents/:id/extract', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const d = docAcessivel(t, ctx.params.id, papel);
    let textoFonte = d.transcription, origem = 'transcrição digitada';
    if (!textoFonte && d.storage_key && d.mime === 'application/pdf') {
      try {
        const buf = decifrar(fs.readFileSync(path.join(pastaArquivos, d.storage_key)));
        textoFonte = execFileSync('pdftotext', ['-q', '-l', '20', '-', '-'], { input: buf, timeout: 20000, maxBuffer: 5 * 1024 * 1024 }).toString('utf8');
        origem = 'camada de texto do PDF (pdftotext)';
      } catch { textoFonte = ''; }
    }
    if (!textoFonte.trim()) {
      return { disponivel: false, mensagem: d.mime?.startsWith('image/')
        ? 'OCR de imagens não está configurado neste servidor (requer Tesseract). Digite ou cole a transcrição do documento e tente novamente.'
        : 'Não há texto para analisar. Digite ou cole a transcrição do documento.' };
    }
    return { disponivel: true, origem, sugestoes: extrairDados(textoFonte), aviso: 'Sugestões automáticas: revise cada item antes de gravar. O arquivo original não é alterado.' };
  });

  // ---- Fontes e citações ----
  r.get('/api/trees/:treeId/sources', (ctx) => {
    papelNaArvore(ctx, ctx.params.treeId);
    return { fontes: all(`SELECT s.*, (SELECT COUNT(*) FROM source_citations WHERE source_id = s.id) citacoes FROM sources s WHERE s.tree_id = ? AND s.deleted_at IS NULL ORDER BY s.title`, ctx.params.treeId) };
  });
  r.post('/api/trees/:treeId/sources', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'contributor');
    const b = ctx.body, id = uuid();
    run('INSERT INTO sources (id, tree_id, title, author, repository, url, coverage, period, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)', id, t,
      texto(b.title, { campo: 'Título', max: 250, obrigatorio: true }), texto(b.author, { max: 250 }), texto(b.repository, { max: 250 }), urlSegura(b.url),
      texto(b.coverage, { max: 250 }), texto(b.period, { max: 120 }), texto(b.notes, { max: 5000 }), ctx.user.id);
    auditar(ctx, t, 'fonte.criada', 'source', id);
    return { status: 201, body: { id } };
  });
  r.delete('/api/trees/:treeId/sources/:id', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    run(`UPDATE sources SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND tree_id = ?`, ctx.params.id, t);
    auditar(ctx, t, 'fonte.excluida', 'source', ctx.params.id);
    return { ok: true };
  });
  r.post('/api/trees/:treeId/sources/:id/citations', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const s = get('SELECT id FROM sources WHERE id = ? AND tree_id = ? AND deleted_at IS NULL', ctx.params.id, t);
    if (!s) throw erro(404, 'Fonte não encontrada.');
    const docId = ctx.body.document_id ? docAcessivel(t, exigirUuid(ctx.body.document_id), papel).id : null;
    const id = uuid();
    run('INSERT INTO source_citations (id, source_id, document_id, page, quote) VALUES (?,?,?,?,?)', id, s.id, docId, texto(ctx.body.page, { max: 250 }), texto(ctx.body.quote, { max: 5000 }));
    return { status: 201, body: { id } };
  });

  // ---- Grafo de evidências ----
  r.get('/api/trees/:treeId/evidence', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t);
    const niveis = nivelPermitido(papel);
    const evid = all(`SELECT e.*, d.title documento, d.access_level FROM evidence_items e LEFT JOIN documents d ON d.id = e.document_id WHERE e.tree_id = ? ${ctx.query.target_id ? 'AND e.target_id = ?' : ''} ORDER BY e.created_at DESC LIMIT 500`,
      ...(ctx.query.target_id ? [t, ctx.query.target_id] : [t]));
    return { evidencias: evid.map((e) => (e.document_id && !niveis.includes(e.access_level) ? { ...e, documento: 'Documento restrito', document_id: null } : e)) };
  });
  r.post('/api/trees/:treeId/evidence', (ctx) => {
    const t = ctx.params.treeId;
    const papel = papelNaArvore(ctx, t, 'contributor');
    const b = ctx.body;
    const target_type = opcao(b.target_type, ['person', 'relationship', 'event'], null, 'Alvo');
    const target_id = exigirUuid(b.target_id, 'Alvo');
    if (target_type === 'person') pessoaNaArvore(t, target_id);
    else if (!get(`SELECT 1 FROM ${target_type === 'relationship' ? 'relationships' : 'life_events'} WHERE id = ? AND tree_id = ?`, target_id, t)) throw erro(404, 'Alvo não encontrado.');
    const docId = b.document_id ? docAcessivel(t, exigirUuid(b.document_id), papel).id : null;
    const id = uuid();
    run(`INSERT INTO evidence_items (id, tree_id, target_type, target_id, field, document_id, kind, stance, note, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`, id, t, target_type, target_id,
      texto(b.field, { max: 60 }), docId, opcao(b.kind, VERIF, 'declared', 'Tipo de evidência'), b.stance === -1 ? -1 : 1, texto(b.note, { max: 2000 }), ctx.user.id);
    // Evidência contestando marca o alvo como contestado; documental eleva "declarada" para "documentada".
    const tabela = target_type === 'person' ? 'persons' : target_type === 'relationship' ? 'relationships' : 'life_events';
    const col = target_type === 'relationship' ? 'status' : 'verification';
    if (b.stance === -1) run(`UPDATE ${tabela} SET ${col} = 'contested' WHERE id = ?`, target_id);
    else if (docId && ['documented', 'confirmed'].includes(b.kind)) run(`UPDATE ${tabela} SET ${col} = ? WHERE id = ? AND ${col} IN ('declared','extracted','hypothesis')`, b.kind, target_id);
    auditar(ctx, t, 'evidencia.criada', target_type, target_id, b.stance === -1 ? 'contesta' : 'sustenta');
    return { status: 201, body: { id } };
  });
  r.delete('/api/trees/:treeId/evidence/:id', (ctx) => {
    const t = ctx.params.treeId;
    papelNaArvore(ctx, t, 'editor');
    run('DELETE FROM evidence_items WHERE id = ? AND tree_id = ?', ctx.params.id, t);
    auditar(ctx, t, 'evidencia.excluida', 'evidence', ctx.params.id);
    return { ok: true };
  });
}
