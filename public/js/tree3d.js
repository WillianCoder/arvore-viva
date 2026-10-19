// Árvore 3D (Three.js, carregado sob demanda). Compartilha dados, seleção e filtros com o 2D.
import { calcularLayout, percorrer, passaFiltro } from './layout.js';

const LIMITE_NOS = 4000;
const LIMITE_ROTULOS = 220;
let THREE = null;

export async function suporta3D() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch { return false; }
}

export class Arvore3D {
  static async criar(container, cb) {
    if (!THREE) THREE = await import('/vendor/three/three.module.min.js');
    const a = new Arvore3D(container, cb);
    return a;
  }

  constructor(container, cb) {
    this.cb = cb;
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cb.baixaQualidade?.() ? 1 : 2));
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', 'Árvore genealógica em 3D. Arraste para girar, Shift+arrastar ou botão direito para mover, roda para zoom. Setas navegam entre parentes e Enter abre o perfil.');
    container.append(this.canvas);
    this.cena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 20000);
    this.cena.add(new THREE.AmbientLight(0xffffff, 0.75));
    const luz = new THREE.DirectionalLight(0xffffff, 0.9); luz.position.set(200, 400, 300); this.cena.add(luz);
    this.alvo = new THREE.Vector3();
    this.orb = { theta: 0.35, phi: 1.15, r: 300 };
    this.modoCamera = 'livre';
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.rotulos = new THREE.Group(); this.cena.add(this.rotulos);
    this.cacheTexturas = new Map();
    this.tema();
    this.eventos();
    this.ro = new ResizeObserver(() => this.redimensionar());
    this.ro.observe(container);
    this.redimensionar();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  tema() {
    const est = getComputedStyle(document.documentElement);
    const c = (v) => new THREE.Color(est.getPropertyValue(v).trim() || '#888');
    this.cores = { bg: c('--bg'), M: c('--blue'), F: c('--gold'), X: c('--muted'), sel: c('--gold'), anc: c('--gold'), desc: c('--blue'), fraco: c('--border-forte'),
      linha: c('--muted'), conjuge: c('--gold'), adotivo: c('--green'), legal: c('--blue'), criacao: c('--purple'), hipotese: c('--amber'), contestado: c('--red'), caminho: c('--purple'), texto: est.getPropertyValue('--text').trim(), fundoTexto: est.getPropertyValue('--surface').trim() };
    this.cena.background = this.cores.bg;
    this.cacheTexturas.clear();
    if (this.g) this.reconstruir();
  }

  atualizar(g, op) {
    this.g = g; this.op = op;
    this.reconstruir();
  }

  reconstruir() {
    const g = this.g, op = this.op;
    const estilo = op.estilo3d || 'vertical';
    const L = calcularLayout(g, { ...op, layout: estilo === 'radial' ? 'radial' : estilo === 'network' ? 'network' : 'vertical' });
    this.L = L;
    let ids = [...L.nos.keys()];
    this.cortado = false;
    if (ids.length > LIMITE_NOS) {
      // Grande demais: mostra só a linhagem da pessoa selecionada.
      const foco = op.selecionado && L.nos.has(op.selecionado) ? op.selecionado : ids[0];
      const lin = new Set([foco, ...percorrer(L.idx.pais, foco), ...percorrer(L.idx.filhos, foco)]);
      ids = ids.filter((id) => lin.has(id)).slice(0, LIMITE_NOS);
      this.cortado = true;
    }
    this.filtrado = new Set(ids.filter((id) => !passaFiltro(g.porId.get(id), L.gen.get(id) - L.minGen, op.filtros, L.idx)));
    if (op.filtros.ocultarFiltrados) ids = ids.filter((id) => !this.filtrado.has(id));
    const esc = 0.11;
    const espacoGen = 34;
    // Posições 3D por estilo.
    const pos = new Map();
    const nosArr = ids.map((id) => L.nos.get(id));
    const cx = (Math.min(...nosArr.map((n) => n.x)) + Math.max(...nosArr.map((n) => n.x))) / 2 || 0;
    const cy = (Math.min(...nosArr.map((n) => n.y)) + Math.max(...nosArr.map((n) => n.y))) / 2 || 0;
    // Profundidade por linhagem: cada raiz recebe um plano; descendentes herdam a média dos pais.
    const z = new Map();
    const raizes = ids.filter((id) => !(L.idx.pais.get(id) || []).some((p) => L.nos.has(p.id))).sort((a, b) => L.nos.get(a).x - L.nos.get(b).x);
    raizes.forEach((id, i) => z.set(id, ((i % 5) - 2) * 18));
    const ordem = [...ids].sort((a, b) => L.gen.get(a) - L.gen.get(b));
    for (const id of ordem) if (!z.has(id)) { const ps = (L.idx.pais.get(id) || []).filter((p) => z.has(p.id)); z.set(id, ps.length ? ps.reduce((s, p) => s + z.get(p.id), 0) / ps.length : 0); }
    for (const id of ids) {
      const n = L.nos.get(id);
      if (estilo === 'radial') pos.set(id, new THREE.Vector3(n.x * esc, -(n.gen - L.minGen) * espacoGen, n.y * esc));
      else if (estilo === 'network') pos.set(id, new THREE.Vector3((n.x - cx) * esc, -(n.y - cy) * esc, (z.get(id) || 0) * 2 + Math.sin(n.x * 0.01) * 20));
      else pos.set(id, new THREE.Vector3((n.x - cx) * esc, -(n.gen - L.minGen) * espacoGen, z.get(id) || 0));
    }
    this.pos = pos;
    this.ids = ids;
    this.indice = new Map(ids.map((id, i) => [id, i]));
    // Limpa a cena anterior.
    for (const o of [this.malha, this.linhas]) if (o) { this.cena.remove(o); o.geometry.dispose(); o.material.dispose(); }
    // Nós: uma malha instanciada (rápida para milhares).
    const geo = new THREE.SphereGeometry(2.6, 18, 14);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 });
    this.malha = new THREE.InstancedMesh(geo, mat, Math.max(1, ids.length));
    this.malha.count = ids.length;
    const m4 = new THREE.Matrix4();
    ids.forEach((id, i) => { m4.makeTranslation(pos.get(id).x, pos.get(id).y, pos.get(id).z); this.malha.setMatrixAt(i, m4); });
    this.cena.add(this.malha);
    // Arestas
    const vertices = [], cores = [];
    const corRel = (r) => (r.status === 'contested' ? this.cores.contestado : r.status === 'hypothesis' ? this.cores.hipotese : r.type === 'spouse' || r.type === 'partner' ? this.cores.conjuge
      : r.subtype === 'adoptive' ? this.cores.adotivo : r.subtype === 'legal' || r.type === 'guardian' ? this.cores.legal : r.subtype === 'step' || r.subtype === 'foster' ? this.cores.criacao : this.cores.linha);
    this.arestas = [];
    for (const r of g.relacoes) {
      const a = pos.get(r.person_a), b = pos.get(r.person_b);
      if (!a || !b || r.type === 'unknown') continue;
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c = corRel(r);
      cores.push(c.r, c.g, c.b, c.r, c.g, c.b);
      this.arestas.push(r);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
    this.linhas = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
    this.cena.add(this.linhas);
    this.destacar(op.selecionado, op.caminho, false);
    if (!this.posicionada) { this.enquadrar(false); this.posicionada = true; }
    this.cb.aoDesenhar?.({ nos: ids.length, total: L.nos.size, cortado: this.cortado });
  }

  destacar(sel, caminho, mover = true) {
    if (!this.malha) return;
    this.sel = sel && this.indice.has(sel) ? sel : null;
    const anc = this.sel ? percorrer(this.L.idx.pais, this.sel) : new Set();
    const desc = this.sel ? percorrer(this.L.idx.filhos, this.sel) : new Set();
    const cam = new Set(caminho || []);
    const m4 = new THREE.Matrix4(), esc = new THREE.Vector3(), q = new THREE.Quaternion();
    this.ids.forEach((id, i) => {
      const p = this.g.porId.get(id);
      let cor = this.cores[p.sex] || this.cores.X;
      let s = 1;
      if (this.filtrado.has(id)) cor = this.cores.fraco;
      if (anc.has(id)) cor = this.cores.anc;
      if (desc.has(id)) cor = this.cores.desc;
      if (cam.has(id)) { cor = this.cores.caminho; s = 1.4; }
      if (id === this.sel) { cor = this.cores.sel; s = 1.9; }
      if (this.sel && id !== this.sel && !anc.has(id) && !desc.has(id) && !cam.has(id)) cor = cor.clone().lerp(this.cores.bg, 0.55);
      this.malha.setColorAt(i, cor);
      esc.set(s, s, s);
      m4.compose(this.pos.get(id), q, esc);
      this.malha.setMatrixAt(i, m4);
    });
    this.malha.instanceMatrix.needsUpdate = true;
    if (this.malha.instanceColor) this.malha.instanceColor.needsUpdate = true;
    if (mover && this.sel && this.modoCamera === 'focada') this.focar(this.sel);
    this.rotulosSujos = true;
  }

  // ---- Câmera ----
  definirModoCamera(m) { this.modoCamera = m; if (m === 'focada' && this.sel) this.focar(this.sel); }
  focar(id) {
    const p = this.pos?.get(id);
    if (!p) return;
    this.irPara(p.clone(), Math.min(this.orb.r, 160));
  }
  enquadrar(animar = true) {
    if (!this.pos?.size) return;
    const caixa = new THREE.Box3();
    for (const p of this.pos.values()) caixa.expandByPoint(p);
    const centro = caixa.getCenter(new THREE.Vector3());
    const tam = caixa.getSize(new THREE.Vector3()).length();
    const r = Math.max(80, tam * 0.9);
    if (animar) this.irPara(centro, r); else { this.alvo.copy(centro); this.orb.r = r; }
  }
  irPara(alvo, r) {
    if (this.cb.semAnimacao?.()) { this.alvo.copy(alvo); this.orb.r = r; this.rotulosSujos = true; return; }
    this.tween = { de: this.alvo.clone(), para: alvo, r0: this.orb.r, r1: r, t0: performance.now(), dur: 650 };
  }
  zoom(f) { this.orb.r = Math.max(15, Math.min(8000, this.orb.r / f)); this.rotulosSujos = true; }

  atualizarCamera() {
    const { theta, phi, r } = this.orb;
    this.camera.position.set(this.alvo.x + r * Math.sin(phi) * Math.sin(theta), this.alvo.y + r * Math.cos(phi), this.alvo.z + r * Math.sin(phi) * Math.cos(theta));
    this.camera.lookAt(this.alvo);
  }

  loop(agora) {
    this.raf = requestAnimationFrame(this.loop);
    if (this.tween) {
      const p = Math.min(1, (agora - this.tween.t0) / this.tween.dur), e = 1 - Math.pow(1 - p, 3);
      this.alvo.lerpVectors(this.tween.de, this.tween.para, e);
      this.orb.r = this.tween.r0 + (this.tween.r1 - this.tween.r0) * e;
      if (p >= 1) this.tween = null;
      this.rotulosSujos = true;
    }
    this.atualizarCamera();
    if (this.rotulosSujos && (!this.ultimoRotulo || agora - this.ultimoRotulo > 120)) { this.atualizarRotulos(); this.ultimoRotulo = agora; this.rotulosSujos = false; }
    this.renderer.render(this.cena, this.camera);
  }

  // Rótulos só para os nós mais próximos da câmera (limite para desempenho).
  atualizarRotulos() {
    if (!this.pos) return;
    for (const s of [...this.rotulos.children]) { this.rotulos.remove(s); s.material.dispose(); }
    const cam = this.camera.position;
    const perto = this.ids.map((id) => [id, this.pos.get(id).distanceToSquared(cam)]).sort((a, b) => a[1] - b[1]).slice(0, LIMITE_ROTULOS);
    const limiteDist = (this.orb.r * 2.2) ** 2;
    for (const [id, d] of perto) {
      if (d > limiteDist && id !== this.sel) continue;
      const p = this.g.porId.get(id);
      const tex = this.textura(p);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, opacity: this.sel && id !== this.sel && this.filtrado.has(id) ? 0.4 : 1 }));
      const pos = this.pos.get(id);
      sp.position.set(pos.x, pos.y + 8.5, pos.z);
      sp.scale.set(tex.image.width / 13, tex.image.height / 13, 1);
      this.rotulos.add(sp);
    }
  }
  textura(p) {
    const chave = p.id + (p.id === this.sel ? '*' : '');
    if (this.cacheTexturas.has(chave)) return this.cacheTexturas.get(chave);
    const nome = p.full_name.length > 26 ? p.full_name.slice(0, 25) + '…' : p.full_name;
    const anos = p.restrito ? '' : [p.birth_date?.slice(0, 4), p.death_date?.slice(0, 4)].filter(Boolean).join('–');
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = '600 26px system-ui, sans-serif';
    const w = Math.ceil(Math.max(ctx.measureText(nome).width, 60)) + 24;
    c.width = w; c.height = anos ? 64 : 40;
    ctx.fillStyle = this.cores.fundoTexto; ctx.globalAlpha = 0.88;
    ctx.beginPath(); ctx.roundRect?.(0, 0, w, c.height, 10); ctx.fill?.();
    if (!ctx.roundRect) ctx.fillRect(0, 0, w, c.height);
    ctx.globalAlpha = 1; ctx.fillStyle = this.cores.texto; ctx.font = '600 26px system-ui, sans-serif'; ctx.fillText(nome, 12, 29);
    if (anos) { ctx.font = '20px system-ui, sans-serif'; ctx.globalAlpha = 0.7; ctx.fillText(anos, 12, 54); }
    if (p.id === this.sel) { ctx.globalAlpha = 1; ctx.strokeStyle = '#d2ad62'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, c.height - 4); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (this.cacheTexturas.size > 600) this.cacheTexturas.clear();
    this.cacheTexturas.set(chave, tex);
    return tex;
  }

  redimensionar() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  eventos() {
    const c = this.canvas;
    let arrasto = null, moveu = false;
    const ponteiros = new Map();
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      arrasto = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, theta: this.orb.theta, phi: this.orb.phi, alvo: this.alvo.clone() };
      if (ponteiros.size === 2) { const [a, b] = [...ponteiros.values()]; this.pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), r: this.orb.r }; }
      moveu = false;
    });
    c.addEventListener('pointermove', (e) => {
      if (!ponteiros.has(e.pointerId)) return;
      ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ponteiros.size === 2 && this.pinca) { const [a, b] = [...ponteiros.values()]; this.orb.r = Math.max(15, this.pinca.r * this.pinca.d / Math.hypot(a.x - b.x, a.y - b.y)); moveu = true; this.rotulosSujos = true; return; }
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moveu = true;
      if (arrasto.pan) {
        const f = this.orb.r / 600;
        const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
        const direita = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize();
        const cima = new THREE.Vector3().crossVectors(direita, dir).normalize();
        this.alvo.copy(arrasto.alvo).addScaledVector(direita, -dx * f).addScaledVector(cima, dy * f);
        this.tween = null;
      } else {
        this.orb.theta = arrasto.theta - dx * 0.006;
        this.orb.phi = Math.max(0.15, Math.min(Math.PI - 0.15, arrasto.phi - dy * 0.006));
      }
      this.rotulosSujos = true;
    });
    const fim = (e) => { ponteiros.delete(e.pointerId); if (ponteiros.size < 2) this.pinca = null; if (!ponteiros.size) arrasto = null; };
    c.addEventListener('pointerup', (e) => {
      fim(e);
      if (moveu) return;
      const id = this.escolher(e);
      if (!id) return;
      const agora = Date.now();
      if (this.ultimo?.id === id && agora - this.ultimo.t < 350) this.cb.aoAbrir?.(id); else this.cb.aoSelecionar?.(id);
      this.ultimo = { id, t: agora };
    });
    c.addEventListener('pointercancel', fim);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(Math.exp(-e.deltaY * 0.0012)); }, { passive: false });
    c.addEventListener('keydown', (e) => {
      const idx = this.L?.idx;
      if (!idx) return;
      const ir = (id) => { if (id && this.indice.has(id)) { e.preventDefault(); this.cb.aoSelecionar?.(id); this.focar(id); } };
      if (e.key === '+' || e.key === '=') { this.zoom(1.25); e.preventDefault(); }
      else if (e.key === '-') { this.zoom(0.8); e.preventDefault(); }
      else if (e.key === '0') { this.enquadrar(); e.preventDefault(); }
      else if (!this.sel) { if (e.key.startsWith('Arrow')) ir(this.ids[0]); }
      else if (e.key === 'ArrowUp') ir((idx.pais.get(this.sel) || [])[0]?.id);
      else if (e.key === 'ArrowDown') ir((idx.filhos.get(this.sel) || [])[0]?.id);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const lista = (idx.conjuges.get(this.sel) || []).map((x) => x.id).concat((idx.pais.get(this.sel) || []).flatMap((p) => (idx.filhos.get(p.id) || []).map((x) => x.id))).filter((id) => id !== this.sel);
        ir(lista[e.key === 'ArrowLeft' ? lista.length - 1 : 0]);
      } else if (e.key === 'Enter') { e.preventDefault(); this.cb.aoAbrir?.(this.sel); }
    });
  }

  escolher(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.intersectObject(this.malha, false)[0];
    return hit ? this.ids[hit.instanceId] : null;
  }

  // Imagem PNG da visão atual.
  capturar() { this.renderer.render(this.cena, this.camera); return this.canvas.toDataURL('image/png'); }

  destruir() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const s of this.rotulos.children) s.material.dispose();
    for (const t of this.cacheTexturas.values()) t.dispose();
    for (const o of [this.malha, this.linhas]) if (o) { o.geometry.dispose(); o.material.dispose(); }
    this.renderer.dispose();
    this.canvas.remove();
  }
}
