// Dados de demonstração: personagens, lugares de exemplo e documentos claramente marcados.
import { all, get, run, tx, uuid } from '../db.js';
import { auditar } from '../acesso.js';
import { salvarLocal, indexarBusca } from '../servicos.js';
import { cifrarTexto, hmacIdentificador } from '../lib/seguranca.js';

const L = {
  genova: { name: 'Gênova, Ligúria, Itália', municipality: 'Gênova', state: 'Ligúria', country: 'Itália', lat: 44.4056, lng: 8.9463, precision: 'city' },
  braga: { name: 'Braga, Portugal', municipality: 'Braga', country: 'Portugal', lat: 41.5454, lng: -8.4265, precision: 'city' },
  santos: { name: 'Santos, SP, Brasil', municipality: 'Santos', state: 'SP', country: 'Brasil', lat: -23.9608, lng: -46.3336, precision: 'city' },
  sp: { name: 'São Paulo, SP, Brasil', municipality: 'São Paulo', state: 'SP', country: 'Brasil', lat: -23.5505, lng: -46.6333, precision: 'city' },
  campinas: { name: 'Campinas, SP, Brasil', municipality: 'Campinas', state: 'SP', country: 'Brasil', lat: -22.9099, lng: -47.0626, precision: 'city' },
  ribeirao: { name: 'Ribeirão Preto, SP, Brasil', municipality: 'Ribeirão Preto', state: 'SP', country: 'Brasil', lat: -21.1775, lng: -47.8103, precision: 'city' },
  curitiba: { name: 'Curitiba, PR, Brasil', municipality: 'Curitiba', state: 'PR', country: 'Brasil', lat: -25.4284, lng: -49.2733, precision: 'city' },
};

// [chave, nome, sexo, nascimento, qual, local, falecimento, local, situação, verificação, apelidos]
const PESSOAS = [
  ['matteo', 'Matteo Corvalli', 'M', '1868-04-12', 'exact', 'genova', '1931-08-03', 'sp', 'deceased', 'documented', ['Mateus']],
  ['giuseppina', 'Giuseppina Rando Corvalli', 'F', '1872', 'about', 'genova', '1940-02-19', 'sp', 'deceased', 'declared', ['Pina']],
  ['joaquim', 'Joaquim Brandemar', 'M', '1870-11-02', 'exact', 'braga', '1935-06-21', 'campinas', 'deceased', 'documented', []],
  ['mariaceu', 'Maria do Céu Arantes', 'F', '1874', 'estimated', 'braga', '1898-01-10', 'campinas', 'deceased', 'hypothesis', []],
  ['analuisa', 'Ana Luísa Teixeira Brandemar', 'F', '1876-03-08', 'exact', 'campinas', '1950-09-30', 'campinas', 'deceased', 'confirmed', []],
  ['pietro', 'Pietro Corvalli', 'M', '1895-07-14', 'exact', 'sp', '1962-12-01', 'sp', 'deceased', 'documented', ['Pedro']],
  ['rosa', 'Rosa Corvalli Sales', 'F', '1898-05-22', 'exact', 'sp', '1979-04-04', 'sp', 'deceased', 'declared', []],
  ['augusto', 'Augusto Arantes Brandemar', 'M', '1896-09-09', 'exact', 'campinas', '1970-01-15', 'campinas', 'deceased', 'declared', []],
  ['celina', 'Celina Brandemar Corvalli', 'F', '1900-02-17', 'exact', 'campinas', '1978-10-25', 'sp', 'deceased', 'confirmed', ['Lina']],
  ['henrique', 'Henrique Corvalli', 'M', '1925-03-30', 'exact', 'sp', '2001-07-07', 'sp', 'deceased', 'documented', []],
  ['lucia', 'Lúcia Corvalli Ferraz', 'F', '1928-11-11', 'exact', 'sp', '2015-05-05', 'curitiba', 'deceased', 'declared', []],
  ['dalva', 'Dalva Mendes Corvalli', 'F', '1930-06-01', 'exact', 'ribeirao', '2010-03-12', 'sp', 'deceased', 'declared', []],
  ['claudio', 'Cláudio Rando Sales', 'M', '1924-08-19', 'about', 'sp', '1990', 'sp', 'deceased', 'declared', []],
  ['rubens', 'Rubens Brandemar', 'M', '1925-12-24', 'exact', 'campinas', '1999-02-02', 'campinas', 'deceased', 'declared', []],
  ['marina', 'Marina Corvalli', 'F', '1955-04-18', 'exact', 'sp', '', null, 'living', 'declared', []],
  ['paulo', 'Paulo Corvalli', 'M', '1958-09-03', 'exact', 'sp', '', null, 'living', 'declared', []],
  ['tiago', 'Tiago Corvalli', 'M', '1962-01-27', 'exact', 'ribeirao', '', null, 'living', 'declared', []],
  ['eduardo', 'Eduardo Nogueira', 'M', '1953-10-10', 'exact', 'curitiba', '', null, 'living', 'declared', []],
  ['beatriz', 'Beatriz Corvalli Nogueira', 'F', '1985-02-14', 'exact', 'curitiba', '', null, 'living', 'declared', []],
  // Registros "soltos" que geram correspondências para revisão:
  ['josefina', 'Josefina Rando', 'F', '1872', 'exact', 'genova', '1940', 'sp', 'deceased', 'extracted', []],
  ['pedro2', 'Pedro Corvali', 'M', '1895', 'about', 'sp', '', null, 'deceased', 'extracted', []],
];

// [genitor, filho, natureza] ou [a, b, tipo, inicio, fim, motivo]
const PAIS = [
  ['matteo', 'pietro'], ['giuseppina', 'pietro'], ['matteo', 'rosa'], ['giuseppina', 'rosa'],
  ['joaquim', 'augusto'], ['mariaceu', 'augusto', 'biological', 'hypothesis'], ['joaquim', 'celina'], ['analuisa', 'celina'],
  ['pietro', 'henrique'], ['celina', 'henrique'], ['pietro', 'lucia'], ['celina', 'lucia'],
  ['rosa', 'claudio'], ['augusto', 'rubens'],
  ['henrique', 'marina'], ['dalva', 'marina'], ['henrique', 'paulo'], ['dalva', 'paulo'],
  ['henrique', 'tiago', 'adoptive'], ['dalva', 'tiago', 'adoptive'],
  ['marina', 'beatriz'], ['eduardo', 'beatriz'],
];
const CASAIS = [
  ['matteo', 'giuseppina', 'spouse', '1893', '', ''], ['joaquim', 'mariaceu', 'spouse', '1895', '1898-01-10', 'viuvez'], ['joaquim', 'analuisa', 'spouse', '1899-05-20', '', ''],
  ['pietro', 'celina', 'spouse', '1921-09-17', '', ''], ['henrique', 'dalva', 'spouse', '1953-02-07', '', ''], ['marina', 'eduardo', 'spouse', '1983', '1994', 'divórcio'],
];

export function criarDemo(ctx) {
  return tx(() => {
    const t = uuid();
    run(`INSERT INTO family_trees (id, name, description, owner_id, is_demo) VALUES (?,?,?,?,1)`, t, 'Família Corvalli–Brandemar (DEMONSTRAÇÃO)',
      'Árvore fictícia para conhecer o sistema. Pessoas, documentos e números são inventados. Pode ser removida a qualquer momento sem afetar seus registros.', ctx.user.id);
    run(`INSERT INTO tree_memberships (tree_id, user_id, role) VALUES (?,?,'owner')`, t, ctx.user.id);
    const id = {};
    for (const [k, nome, sexo, nasc, q, ln, fal, lf, sit, ver, apelidos] of PESSOAS) {
      id[k] = uuid();
      run(`INSERT INTO persons (id, full_name, sex, living_status, birth_date, birth_qual, birth_place_id, death_date, death_place_id, verification, is_demo, created_by, bio) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        id[k], nome, sexo, sit, nasc, q, salvarLocal(L[ln]), fal, lf ? salvarLocal(L[lf]) : null, ver, ctx.user.id, 'Personagem fictício (dados de demonstração).');
      run('INSERT INTO tree_persons (tree_id, person_id) VALUES (?,?)', t, id[k]);
      for (const a of apelidos) run(`INSERT INTO person_names (id, person_id, kind, name, norm) VALUES (?,?,'nickname',?,?)`, uuid(), id[k], a, a.toLowerCase());
      indexarBusca(id[k]);
    }
    run(`INSERT INTO person_names (id, person_id, kind, name, norm) VALUES (?,?,'previous',?,?)`, uuid(), id.celina, 'Celina Teixeira Brandemar', 'celina teixeira brandemar');
    const rel = {};
    for (const [a, b, sub = 'biological', st] of PAIS) {
      const r = uuid(); rel[`${a}>${b}`] = r;
      run(`INSERT INTO relationships (id, tree_id, person_a, person_b, type, subtype, status, created_by) VALUES (?,?,?,?, 'parent', ?, ?, ?)`, r, t, id[a], id[b], sub, st || 'declared', ctx.user.id);
    }
    for (const [a, b, tipo, ini, fim, mot] of CASAIS) {
      const r = uuid(); rel[`${a}+${b}`] = r;
      run(`INSERT INTO relationships (id, tree_id, person_a, person_b, type, subtype, status, start_date, end_date, end_reason, created_by) VALUES (?,?,?,?,?, 'unknown', 'declared', ?,?,?,?)`, r, t, id[a], id[b], tipo, ini, fim, mot, ctx.user.id);
    }
    const evt = (p, tipo, data, lugar, desc, ver = 'declared') => {
      const e = uuid();
      run(`INSERT INTO life_events (id, tree_id, person_id, type, date, place_id, description, verification, created_by) VALUES (?,?,?,?,?,?,?,?,?)`, e, t, id[p], tipo, data, lugar ? salvarLocal(L[lugar]) : null, desc, ver, ctx.user.id);
      return e;
    };
    const eImig = evt('matteo', 'immigration', '1891-03-02', 'santos', 'Chegada ao porto de Santos (exemplo fictício).', 'documented');
    evt('giuseppina', 'immigration', '1891-03-02', 'santos', 'Chegada junto com Matteo (exemplo fictício).');
    evt('matteo', 'residence', '1892', 'sp', 'Residência registrada em São Paulo.');
    evt('joaquim', 'immigration', '1890', 'santos', 'Data aproximada de chegada (exemplo fictício).');
    evt('joaquim', 'residence', '1891', 'campinas', 'Estabelecido em Campinas.');
    evt('lucia', 'residence', '1960', 'curitiba', 'Mudança para Curitiba.');
    evt('marina', 'residence', '1990', 'curitiba', 'Residência (pessoa viva: exibida só no nível da cidade).');
    evt('celina', 'name_change', '1921-09-17', 'sp', 'Adotou o sobrenome Corvalli no casamento.');

    const fonte = uuid();
    run(`INSERT INTO sources (id, tree_id, title, author, repository, coverage, period, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)`, fonte, t, 'Livro de registro de imigrantes nº 12 (EXEMPLO FICTÍCIO)', '', 'Arquivo de exemplo', 'São Paulo', '1890–1895', 'Fonte inventada para demonstração.', ctx.user.id);
    const doc = (titulo, cat, data, lugar, ver, ref, transcricao, links, nivel = 'tree') => {
      const d = uuid();
      run(`INSERT INTO documents (id, tree_id, title, category, doc_date, place_id, institution, reference, notes, transcription, verification, access_level, is_demo, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
        d, t, `${titulo} (EXEMPLO)`, cat, data, salvarLocal(L[lugar]), 'Cartório de exemplo', ref, 'Documento fictício de demonstração. Não corresponde a registro real.', transcricao, ver, nivel, ctx.user.id);
      for (const l of links) run('INSERT INTO document_links (id, document_id, person_id, relationship_id, event_id) VALUES (?,?,?,?,?)', uuid(), d, l.p ? id[l.p] : null, l.r ? rel[l.r] : null, l.e || null);
      return d;
    };
    const dCas = doc('Certidão de casamento de Pietro e Celina', 'marriage_cert', '1921-09-17', 'sp', 'documented', 'EX-LIVRO B-3, FL. 45',
      'Aos dezessete de setembro de 1921, na cidade de São Paulo, compareceram Pietro Corvalli, filho de Matteo Corvalli e Giuseppina Rando, e Celina Brandemar, natural de Campinas, filha de Joaquim Brandemar e Ana Luísa Teixeira.',
      [{ p: 'pietro' }, { p: 'celina' }, { r: 'pietro+celina' }]);
    const dImig = doc('Registro de entrada de imigrante — Matteo Corvalli', 'immigration', '1891-03-02', 'santos', 'documented', 'EX-REG-0912',
      'Matteo Corvalli, natural de Gênova, chegado em 02/03/1891, acompanhado de Giuseppina Rando.', [{ p: 'matteo' }, { p: 'giuseppina' }, { e: eImig }]);
    const dNasc = doc('Certidão de nascimento de Henrique Corvalli', 'birth_cert', '1925-03-30', 'sp', 'confirmed', 'EX-LIVRO A-7, FL. 112',
      'Henrique, nascido em 30/03/1925 em São Paulo, filho de Pietro Corvalli e Celina Brandemar Corvalli.', [{ p: 'henrique' }, { r: 'pietro>henrique' }, { r: 'celina>henrique' }]);
    doc('Carta de Rosa para Celina', 'letter', '1932', 'sp', 'declared', '', 'Querida Lina, o pequeno Cláudio já está crescido...', [{ p: 'rosa' }, { p: 'celina' }]);
    doc('Termo de adoção de Tiago (EXEMPLO — pessoa viva)', 'notary', '1963', 'ribeirao', 'documented', 'EX-PROC-0001', '', [{ p: 'tiago' }, { r: 'henrique>tiago' }], 'editors');
    run('INSERT INTO source_citations (id, source_id, document_id, page, quote) VALUES (?,?,?,?,?)', uuid(), fonte, dImig, 'fl. 33', 'Matteo Corvalli, 23 anos, agricultor.');
    const ev = (tipo, alvo, d, kind, stance, nota) => run(`INSERT INTO evidence_items (id, tree_id, target_type, target_id, document_id, kind, stance, note, created_by) VALUES (?,?,?,?,?,?,?,?,?)`, uuid(), t, tipo, alvo, d, kind, stance, nota, ctx.user.id);
    ev('relationship', rel['pietro+celina'], dCas, 'documented', 1, 'A certidão registra o casamento.');
    ev('relationship', rel['pietro>henrique'], dNasc, 'confirmed', 1, 'Filiação registrada na certidão.');
    ev('relationship', rel['celina>henrique'], dNasc, 'confirmed', 1, 'Filiação registrada na certidão.');
    ev('relationship', rel['matteo>pietro'], dCas, 'documented', 1, 'Certidão de casamento cita os pais do noivo.');
    ev('person', id.matteo, dImig, 'documented', 1, 'Registro de entrada confirma origem em Gênova.');
    ev('relationship', rel['mariaceu>augusto'], null, 'hypothesis', 1, 'Hipótese baseada em relato oral; falta certidão.');
    ev('person', id.giuseppina, null, 'contested', -1, 'Relato familiar indica nascimento em 1874, divergente do registro de 1872.');
    // Identificador de exemplo (não é CPF: evita coincidir com documento real).
    run(`INSERT INTO person_identifiers (id, person_id, kind, country, issuer, value_enc, value_hmac, last_digits, origin, verification, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      uuid(), id.henrique, 'birth_cert', 'BR', 'Cartório de exemplo', cifrarTexto('EXEMPLO-A7-112'), hmacIdentificador('birth_cert', 'EXEMPLO-A7-112'), '12', 'Certidão de exemplo', 'documented', ctx.user.id);
    run(`INSERT INTO comments (id, tree_id, target_type, target_id, user_id, body, kind) VALUES (?,?,?,?,?,?,?)`, uuid(), t, 'person', id.mariaceu, ctx.user.id, 'Precisamos localizar a certidão de casamento de Joaquim e Maria do Céu.', 'review_request');
    auditar(ctx, t, 'demo.criada', 'tree', t, 'dados de demonstração');
    return t;
  });
}

export function rotasDemo(r) {
  r.post('/api/demo', (ctx) => ({ status: 201, body: { tree_id: criarDemo(ctx) } }));
  // Remove apenas árvores e registros marcados como demonstração deste usuário.
  r.delete('/api/demo', (ctx) => {
    const arvores = all(`SELECT id FROM family_trees WHERE owner_id = ? AND is_demo = 1`, ctx.user.id);
    tx(() => {
      for (const a of arvores) {
        const pessoas = all(`SELECT tp.person_id FROM tree_persons tp JOIN persons p ON p.id = tp.person_id WHERE tp.tree_id = ? AND p.is_demo = 1`, a.id).map((x) => x.person_id);
        run('DELETE FROM family_trees WHERE id = ?', a.id);
        for (const p of pessoas) if (!get('SELECT 1 FROM tree_persons WHERE person_id = ?', p)) run('DELETE FROM persons WHERE id = ?', p);
      }
    });
    auditar(ctx, null, 'demo.removida', 'tree', '', `${arvores.length} árvore(s)`);
    return { removidas: arvores.length };
  });
}
