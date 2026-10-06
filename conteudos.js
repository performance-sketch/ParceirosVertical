/*
 * conteudos.js — Biblioteca de Posts dos Creators · Instagram (aba "Conteúdos")
 *
 * Só exibe o que scripts/instagram_sync.py coletou da página pública de cada post.
 * Métrica ausente aparece como "—" / "Não disponível"; nada é estimado.
 * Envio de link: portal → webhook do Make → GitHub (repository_dispatch) → instagram_sync.py.
 */
(() => {
  const MAKE_WEBHOOK = 'https://hook.us2.make.com/aafi7tp8kh9zimhhpc0yh48f1cfw84uj';   // URL do webhook do cenário "Parceiros Vertical — Receber post" no Make
  const PEND_KEY = 'pv_posts_pendentes';
  const P = window.PV;
  const {$, esc, int, nBR, dBR, pctTxt, ICO} = P;
  const NA = '<span class="na">—</span>';
  const URL_RE = /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})\/?(?:[?#].*)?$/;
  const INTER = ['curtidas', 'comentarios', 'compartilhamentos', 'reposts'];
  const MET = {views: 'Visualizações', curtidas: 'Curtidas', comentarios: 'Comentários', compartilhamentos: 'Compartilhamentos', reposts: 'Reposts'};
  const STATUS = {
    atualizado: ['Atualizado', 'ok'], pendente: ['Atualização pendente', ''], link_invalido: ['Link inválido', 'err'],
    privado: ['Conteúdo privado', 'err'], removido: ['Conteúdo removido', 'err'], indisponivel: ['Conteúdo privado ou removido', 'err'],
    parcial: ['Métricas parcialmente disponíveis', 'warn'], erro_coleta: ['Erro de coleta', 'warn'],
  };
  const METAS_VIEWS = [10e3, 50e3, 100e3, 500e3, 1e6];
  const IMG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/></svg>';
  const C = {tipo: '', ini: '', fim: '', ordem: 'recente', modo: 'cards', rp: null, rc: null, montado: false};

  // ─── Métricas (só calcula quando os dados existem) ───────────────────────
  const D = () => P.D;
  const posts = () => D().posts || [];
  const creatorDe = p => D().admin ? p.creator : D().parceiro.nome;
  const tipoDe = p => p.tipo === 'Reel' ? 'Reel' : (p.tipo_informado || p.tipo || null);
  const m = (p, k) => p.metricas ? p.metricas[k] : null;
  const inter = p => { const v = INTER.map(k => m(p, k)).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const interAprox = p => INTER.some(k => (p.aprox || []).includes(k) && m(p, k) != null);
  const er = p => { const v = m(p, 'views'), i = inter(p); return v && i != null ? i / v * 100 : null; };
  const por1k = (p, k) => { const v = m(p, 'views'), x = m(p, k); return v && x != null ? x / v * 1000 : null; };
  const crescViews = p => {
    const h = (p.historico || []).filter(x => x.views != null);
    return h.length >= 2 && h[0].views ? (h[h.length - 1].views - h[0].views) / h[0].views * 100 : null;
  };
  const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const cv = a => { const mu = media(a); if (!mu || a.length < 2) return null; return Math.sqrt(media(a.map(x => (x - mu) ** 2))) / mu; };
  const soma = (lst, f) => { const v = lst.map(f).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const temViews = lst => lst.some(p => m(p, 'views') != null);
  const fmt = (v, aprox) => v == null ? NA : (aprox ? '≈' : '') + int(Math.round(v));
  const fmtM = (p, k) => fmt(m(p, k), (p.aprox || []).includes(k));
  const fmtPct = v => v == null ? NA : pctTxt(Math.round(v * 100) / 100);
  const quando = s => { if (!s) return '—'; const d = new Date(s); return `${d.toLocaleDateString('pt-BR')} ${String(d.getHours()).padStart(2, '0')}h`; };
  const resumoLeg = (p, n = 60) => { const t = (p.legenda || '').replace(/\s+/g, ' ').trim(); return t ? (t.length > n ? t.slice(0, n - 1) + '…' : t) : null; };
  const titulo = p => `${tipoDe(p) || 'Post'} — ${resumoLeg(p, 48) || (p.perfil ? '@' + p.perfil : p.id)}`;
  const statusHTML = p => { const [t, c] = STATUS[p.status] || ['—', '']; return `<span class="st ${c}">${t}</span>`; };
  // Sem capa (ou capa que não carrega): ícone neutro no mesmo tamanho da miniatura
  const thumbHTML = (p, cls = '') => {
    const ph = cls ? `<span class="${cls} ph">${IMG}</span>` : IMG;
    return p.thumb ? `<img class="${cls}" src="${esc(p.thumb)}" alt="" loading="lazy" onerror="this.outerHTML=this.dataset.ph" data-ph="${esc(ph)}">` : ph;
  };
  const dataRef = p => p.publicado_em || (p.cadastrado_em || '').slice(0, 10);

  function filtrados() {
    return posts().filter(p =>
      (!D().admin || !P.parceiro || p.creator === P.parceiro) &&
      (!C.tipo || tipoDe(p) === C.tipo) &&
      (!C.ini || (p.publicado_em && p.publicado_em >= C.ini)) &&
      (!C.fim || (p.publicado_em && p.publicado_em <= C.fim)));
  }

  // ─── Estrutura da aba ─────────────────────────────────────────────────────
  function montar() {
    const tipos = ['Reel', 'Post', 'Carrossel'].map(t => `<option>${t}</option>`).join('');
    $('v-conteudos').innerHTML = `
      <div class="hero">
        <div class="eyebrow">Biblioteca de posts · Instagram</div>
        <h1 id="c-head"></h1>
        <p class="lead" id="c-lead"></p>
      </div>

      <section class="bloco" style="margin-top:40px">
        <div class="sec-h"><h2>Adicionar publicação</h2></div>
        <form class="addbox" id="c-form" novalidate>
          <div class="f grow"><label for="c-url">Link do post no Instagram</label>
            <input id="c-url" type="url" inputmode="url" placeholder="https://www.instagram.com/reel/…" autocomplete="off" spellcheck="false"></div>
          <div class="f hidden" id="c-f-creator"><label for="c-creator">Creator</label><select id="c-creator"></select></div>
          <div class="f"><label for="c-tipo-in">Tipo de conteúdo</label>
            <select id="c-tipo-in"><option value="">Detectar automaticamente</option>${tipos}</select></div>
          <button class="btn btn-dark" id="c-add" type="submit">Adicionar</button>
        </form>
        <div class="addmsg" id="c-msg"></div>
        <div class="pend" id="c-pend"></div>
      </section>

      <div class="kpis" id="c-kpis" style="margin-top:8px"></div>

      <section class="bloco"><div class="sec-h"><h2>Insights</h2></div><div class="ins" id="c-ins"></div></section>

      <section class="bloco hidden" id="c-selos-b">
        <div class="sec-h"><h2>Selos de performance orgânica</h2><span class="num" id="c-selos-n" style="color:var(--muted)"></span></div>
        <div class="selos" id="c-selos"></div><p class="nota" id="c-selos-nota"></p>
      </section>

      <section class="bloco">
        <div class="sec-h"><h2>Ranking de Conteúdos</h2><div class="tabs" id="c-rp-tabs"></div></div>
        <div class="rank" id="c-rp"></div>
      </section>

      <section class="bloco hidden" id="c-rc-b">
        <div class="sec-h"><h2>Ranking de Creators</h2><div class="tabs" id="c-rc-tabs"></div></div>
        <div class="tbl"><div class="tbl-scroll"><table id="c-rc"></table></div></div>
        <p class="nota" id="c-rc-nota"></p>
      </section>

      <section class="bloco">
        <div class="sec-h"><h2>Biblioteca de posts</h2><span class="num" id="c-cont" style="color:var(--muted)"></span>
          <div class="tabs" id="c-modo"><button class="tab on" type="button" data-m="cards">Cards</button><button class="tab" type="button" data-m="tabela">Tabela</button></div></div>
        <div class="ctool">
          <div class="f hidden" id="c-f-filtro-creator"><label for="c-fcreator">Creator</label><select id="c-fcreator"></select></div>
          <div class="f"><label for="c-ini">Publicado de</label><input type="date" id="c-ini"></div>
          <div class="f"><label for="c-fim">Até</label><input type="date" id="c-fim"></div>
          <div class="f"><label for="c-ftipo">Tipo</label><select id="c-ftipo"><option value="">Todos os tipos</option>${tipos}</select></div>
          <div class="f"><label for="c-ordem">Ordenar por</label><select id="c-ordem">
            <option value="recente">Mais recente</option><option value="views">Mais visualizações</option>
            <option value="curtidas">Mais curtidas</option><option value="comentarios">Mais comentários</option>
            <option value="compartilhamentos">Mais compartilhamentos</option><option value="inter">Mais interações</option>
            <option value="er">Maior engajamento</option></select></div>
        </div>
        <div id="c-lib"></div>
      </section>`;

    $('c-url').addEventListener('input', validarCampo);
    $('c-form').addEventListener('submit', enviar);
    $('c-fcreator').addEventListener('change', e => P.setParceiro(e.target.value));
    $('c-ini').addEventListener('change', e => { C.ini = e.target.value; render(); });
    $('c-fim').addEventListener('change', e => { C.fim = e.target.value; render(); });
    $('c-ftipo').addEventListener('change', e => { C.tipo = e.target.value; render(); });
    $('c-ordem').addEventListener('change', e => { C.ordem = e.target.value; render(); });
    $('c-modo').addEventListener('click', e => { const v = e.target.dataset.m; if (v) { C.modo = v; render(); } });
    $('c-rp-tabs').addEventListener('click', e => { const v = e.target.dataset.k; if (v) { C.rp = v; render(); } });
    $('c-rc-tabs').addEventListener('click', e => { const v = e.target.dataset.k; if (v) { C.rc = v; render(); } });
    $('v-conteudos').addEventListener('click', e => {
      const a = e.target.closest('[data-post]'); if (a) return abrir(a.dataset.post);
      const c = e.target.closest('[data-creator]'); if (c) { P.setParceiro(c.dataset.creator); window.scrollTo({top: 0, behavior: 'smooth'}); }
    });
    $('c-dlg').addEventListener('click', e => {
      const ex = e.target.closest('[data-excluir]'); if (ex) return excluir(ex.dataset.excluir, ex);
      if (e.target === $('c-dlg') || e.target.closest('[data-fechar]')) $('c-dlg').close();
    });
    C.montado = true;
  }

  // ─── Adicionar publicação ─────────────────────────────────────────────────
  function analisar(url) {
    const r = URL_RE.exec((url || '').trim()); if (!r) return null;
    const reel = ['reel', 'reels', 'tv'].includes(r[1]);
    return {url: `https://www.instagram.com/${reel ? 'reel' : 'p'}/${r[2]}/`, id: r[2], reel};
  }
  function validarCampo() {
    const v = $('c-url').value.trim(), msg = $('c-msg');
    msg.className = 'addmsg';
    if (!v) return (msg.textContent = '');
    const a = analisar(v);
    if (!a) { msg.className = 'addmsg err'; msg.textContent = 'Link inválido. Use o link de um Reel, post ou carrossel (instagram.com/reel/… ou instagram.com/p/…).'; return; }
    if (posts().some(p => p.id === a.id)) { msg.className = 'addmsg err'; msg.textContent = 'Esta publicação já está na biblioteca.'; return; }
    msg.textContent = a.reel ? 'Reel identificado.' : 'Post identificado. Se for carrossel, escolha "Carrossel" em Tipo de conteúdo — a página pública não diferencia post de carrossel.';
  }
  const lerPend = () => { try { return JSON.parse(localStorage.getItem(PEND_KEY) || '[]'); } catch (_) { return []; } };
  const gravarPend = l => { try { localStorage.setItem(PEND_KEY, JSON.stringify(l)); } catch (_) {} };
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

  // Assina com a mesma chave que abre os dados do parceiro (conferida em instagram_sync.py) e envia ao Make
  async function enviarAssinado(campos) {
    const raw = await crypto.subtle.exportKey('raw', P.chave);
    const k = await crypto.subtle.importKey('raw', raw, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
    const texto = ['signer', 'login', 'url', 'tipo', 'ts'].map(c => campos[c]).join('\n');
    campos.sig = hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto)));
    const r = await fetch(MAKE_WEBHOOK, {method: 'POST', body: new URLSearchParams(campos)});
    if (!r.ok) throw new Error('HTTP ' + r.status);
  }

  async function enviar(e) {
    e.preventDefault();
    const msg = $('c-msg'), a = analisar($('c-url').value);
    validarCampo();
    if (!a || posts().some(p => p.id === a.id)) return;
    if (!MAKE_WEBHOOK) { msg.className = 'addmsg err'; msg.textContent = 'O envio de links ainda não foi configurado.'; return; }
    const login = D().admin ? $('c-creator').value : P.login;
    const campos = {signer: P.login, login, url: a.url, tipo: $('c-tipo-in').value, ts: new Date().toISOString()};
    $('c-add').disabled = true; $('c-add').textContent = 'Enviando…';
    try {
      await enviarAssinado(campos);
      gravarPend([...lerPend().filter(x => x.id !== a.id), {id: a.id, url: a.url, ts: campos.ts}]);
      PROG[a.id] = {p: 12, txt: 'Enviado · aguardando o GitHub receber'};
      $('c-url').value = ''; $('c-tipo-in').value = '';
      msg.className = 'addmsg ok';
      msg.textContent = 'Publicação enviada! Acompanhe o progresso abaixo — a biblioteca atualiza sozinha ao final.';
      renderPend();
    } catch (_) {
      msg.className = 'addmsg err'; msg.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
    } finally {
      $('c-add').disabled = false; $('c-add').textContent = 'Adicionar';
    }
  }

  // Exclusão: mesmo caminho e assinatura do envio, com tipo "excluir".
  // O creator só exclui os próprios posts; o admin exclui em nome do dono (conferido em instagram_sync.py).
  async function excluir(id, botao) {
    const p = posts().find(x => x.id === id); if (!p) return;
    if (!confirm('Excluir esta publicação da biblioteca?\n\nO histórico de métricas dela também será apagado. Esta ação não pode ser desfeita.')) return;
    const campos = {signer: P.login, login: D().admin ? p.login : P.login, url: p.url, tipo: 'excluir', ts: new Date().toISOString()};
    botao.disabled = true; botao.textContent = 'Excluindo…';
    try {
      await enviarAssinado(campos);
      gravarPend([...lerPend().filter(x => x.id !== id), {id, url: p.url, ts: campos.ts, acao: 'excluir'}]);
      PROG[id] = {p: 12, txt: 'Pedido enviado · aguardando o GitHub receber'};
      $('c-dlg').close();
      const msg = $('c-msg');
      msg.className = 'addmsg ok'; msg.textContent = 'Exclusão solicitada. Acompanhe abaixo — a biblioteca atualiza sozinha ao final.';
      renderPend();
      $('c-pend').scrollIntoView({behavior: 'smooth', block: 'center'});
    } catch (_) {
      botao.disabled = false; botao.textContent = 'Excluir publicação';
      alert('Não foi possível enviar o pedido de exclusão agora. Tente novamente em instantes.');
    }
  }

  // ─── Progresso do envio ───────────────────────────────────────────────────
  // Acompanha as automações pela API pública do GitHub (sem login) e, ao final, lê os dados
  // direto do repositório (sem esperar o Pages). Se a API não responder, a barra fica
  // indeterminada e o portal segue conferindo os dados publicados.
  const GH = 'https://api.github.com/repos/performance-sketch/ParceirosVertical/actions/runs';
  const PROG = {};          // id → {p, txt, cls, ind, fim}
  const cacheGH = {};       // url → {etag, json}
  // A API pública do GitHub permite 60 consultas/hora por IP. O portal guarda uma reserva e,
  // abaixo dela (ou se a API recusar), passa a conferir só os dados publicados no site.
  const RESERVA_API = 15;
  let timer = null, ultimoReload = 0, ocupado = false, ultimaConsulta = 0, apiLivre = 60, apiVoltaEm = 0;
  const ms = s => new Date(s).getTime();
  const primeiro = (lista, f) => lista.filter(f).sort((a, b) => ms(a.created_at) - ms(b.created_at))[0];

  const apiDisponivel = () => Date.now() >= apiVoltaEm && apiLivre > RESERVA_API;
  async function gh(url) {
    if (!apiDisponivel()) return null;
    const c = cacheGH[url];
    try {
      const r = await fetch(url, {headers: c ? {'If-None-Match': c.etag} : {}, cache: 'no-store'});
      const resta = +r.headers.get('X-RateLimit-Remaining'), volta = +r.headers.get('X-RateLimit-Reset');
      if (r.headers.has('X-RateLimit-Remaining')) apiLivre = resta;
      if (volta && (r.status === 403 || r.status === 429 || resta <= RESERVA_API)) apiVoltaEm = volta * 1000;
      if (r.status === 304 && c) return c.json;
      if (!r.ok) return null;
      const json = await r.json();
      cacheGH[url] = {etag: r.headers.get('ETag'), json};
      return json;
    } catch (_) { return null; }
  }

  // receber-post.yml faz tudo num job só; o progresso dentro dele é estimado pelo tempo decorrido
  // (sem consultar os passos, para gastar menos da cota da API).
  function etapa(x, runs) {
    const exc = x.acao === 'excluir', desde = ms(x.ts) - 15000;
    const rec = primeiro(runs, r => r.path.endsWith('receber-post.yml') && ms(r.created_at) >= desde);
    if (!rec) return Date.now() - ms(x.ts) > 90000
      ? {p: 12, txt: 'Na fila do Make · aguardando encaminhamento ao GitHub'}
      : {p: 12, txt: 'Enviado · aguardando o GitHub receber'};
    if (rec.status === 'completed') return rec.conclusion === 'success'
      ? {p: 94, txt: 'Concluindo · carregando no portal', reload: true, rec: rec.id}
      : {p: 100, txt: 'Falha no processamento. Tente adicionar de novo.', cls: 'err'};
    if (rec.status !== 'in_progress') return {p: 25, txt: 'Recebido pelo GitHub · iniciando'};
    const t = (Date.now() - ms(rec.run_started_at || rec.created_at)) / 1000;
    if (t < 8) return {p: 35 + t * 2, txt: exc ? 'Preparando a exclusão' : 'Preparando a coleta'};
    if (t < 16) return {p: 52 + (t - 8) * 2.5, txt: exc ? 'Removendo da biblioteca' : 'Coletando métricas públicas no Instagram'};
    return {p: Math.min(90, 72 + (t - 16) * 1.5), txt: 'Atualizando a biblioteca'};
  }

  async function acompanhar() {
    if (ocupado) return;
    ocupado = true;
    try { await verificar(); } finally { ocupado = false; }
  }

  async function verificar() {
    const pend = lerPend();
    if (!pend.length) { clearInterval(timer); timer = null; return; }
    // Ritmo (cota de 60 consultas/h): 4 s com o GitHub trabalhando ou logo após o envio;
    // 60 s se o envio está parado no Make; nenhuma consulta para itens que só aguardam o site.
    const agoraMs = Date.now(), vivo = x => !PROG[x.id]?.cls && !PROG[x.id]?.aguarda && !PROG[x.id]?.fim;
    const ativo = pend.some(x => vivo(x) && ((PROG[x.id]?.p || 0) > 12 || agoraMs - ms(x.ts) < 90000));
    const consultar = pend.some(vivo) && agoraMs - ultimaConsulta >= (ativo ? 4000 : 60000);
    if (consultar) ultimaConsulta = agoraMs;
    const resp = consultar ? await gh(GH + '?per_page=20') : undefined;
    const runs = resp ? resp.workflow_runs || [] : (consultar ? null : undefined);   // null = API indisponível
    let recarregar = false, fresco = false;
    for (const x of pend) {
      if (!consultar || !vivo(x)) continue;
      PROG[x.id] = runs ? etapa(x, runs) : {p: 50, txt: 'Processando… (conferindo a cada 30 s)', ind: true};
      if (PROG[x.id].reload) recarregar = true;
    }
    // Ao concluir, lê direto do repositório (rápido); sem a API, confere o site a cada 30 s
    if (recarregar && agoraMs - ultimoReload > 3000) { ultimoReload = agoraMs; fresco = apiDisponivel(); await P.recarregar(fresco); }
    else if ((runs === null || pend.some(x => PROG[x.id]?.aguarda || PROG[x.id]?.ind)) && agoraMs - ultimoReload > 30000) { ultimoReload = agoraMs; await P.recarregar(false); }
    const ids = new Set(posts().map(p => p.id));
    let mudou = false;
    pend.forEach(x => {
      // Adicionar conclui quando o post aparece nos dados; excluir, quando ele some
      const exc = x.acao === 'excluir', pronto = exc ? !ids.has(x.id) : ids.has(x.id);
      if (!pronto && PROG[x.id]?.reload && fresco)
        PROG[x.id] = {p: 60, txt: 'Na fila da atualização automática (até 15 min)', ind: true, aguarda: true};
      if (!pronto || PROG[x.id]?.fim) return;
      if (exc) PROG[x.id] = {p: 100, txt: 'Concluído · publicação excluída da biblioteca', cls: 'ok', fim: Date.now()};
      else {
        const p = posts().find(y => y.id === x.id), [st] = STATUS[p.status] || ['Concluído'];
        PROG[x.id] = {p: 100, txt: p.status === 'atualizado' ? 'Concluído · publicação adicionada à biblioteca' : `Concluído · ${st}`, cls: ['atualizado', 'parcial'].includes(p.status) ? 'ok' : 'err', fim: Date.now()};
      }
      mudou = true;
    });
    // Itens concluídos saem da lista alguns segundos depois; envios com mais de 1 dia expiram
    const agora = Date.now();
    const resta = pend.filter(x => !(PROG[x.id]?.fim && agora - PROG[x.id].fim > 6000) && agora - ms(x.ts) < 864e5);
    if (resta.length !== pend.length) { gravarPend(resta); mudou = true; }
    if (mudou) render(); else renderPend();
  }

  function renderPend() {
    const l = lerPend();
    $('c-pend').innerHTML = l.map(x => {
      const g = PROG[x.id] || {p: 8, txt: 'Enviando…'};
      return `<div class="pg ${g.cls || ''}"><div class="pg-top"><a href="${esc(x.url)}" target="_blank" rel="noopener">${x.acao === 'excluir' ? 'Excluir · ' : ''}${esc(x.url)}</a>
        <span class="pg-t ${g.cls || ''}">${esc(g.txt)}</span></div>
        <div class="pg-bar${g.ind ? ' ind' : ''}" role="progressbar" aria-label="${esc(g.txt)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${g.p}"><i style="width:${g.p}%"></i></div></div>`;
    }).join('');
    if (l.length && !timer) { timer = setInterval(acompanhar, 3000); acompanhar(); }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  function render() {
    if (!D()) return;
    if (!C.montado) montar();
    const d = D(), admin = d.admin, sel = admin ? P.parceiro : d.parceiro.nome, geral = admin && !sel;
    const lst = filtrados(), comM = lst.filter(p => inter(p) != null);
    $('h-ciclo').textContent = 'Biblioteca de posts · Instagram';

    // Selects de creator (admin)
    $('c-f-creator').classList.toggle('hidden', !admin);
    $('c-f-filtro-creator').classList.toggle('hidden', !admin);
    if (admin) {
      const ps = [...(d.parceiros || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      $('c-creator').innerHTML = ps.map(p => `<option value="${esc(p.login)}"${p.nome === sel ? ' selected' : ''}>${esc(p.nome)}</option>`).join('');
      $('c-fcreator').innerHTML = '<option value="">Todos os creators</option>' + ps.map(p => `<option${p.nome === sel ? ' selected' : ''}>${esc(p.nome)}</option>`).join('');
    }

    // Hero
    const nCreators = new Set(lst.map(creatorDe)).size, totInter = soma(comM, inter);
    $('c-head').innerHTML = !lst.length ? 'Nenhuma publicação na biblioteca ainda.'
      : geral ? `${int(lst.length)} publicaç${lst.length === 1 ? 'ão' : 'ões'} de ${int(nCreators)} creator${nCreators === 1 ? '' : 's'}${totInter != null ? ` · <span class="pos">${int(totInter)}</span> interações` : ''}.`
      : `${admin ? esc(sel) + ' tem' : 'Você tem'} ${int(lst.length)} publicaç${lst.length === 1 ? 'ão' : 'ões'} na biblioteca${totInter != null ? ` · <span class="pos">${int(totInter)}</span> interações` : ''}.`;
    $('c-lead').textContent = 'Métricas públicas coletadas sem login, uma vez por dia, direto da página de cada publicação.' +
      (temViews(lst) ? '' : ' Visualizações, compartilhamentos e reposts não são exibidos publicamente pelo Instagram e aparecem como "—".');

    renderPend();
    renderKpis(lst, comM);
    renderInsights(lst, comM, geral, sel);
    $('c-selos-b').classList.toggle('hidden', geral);
    if (!geral) renderSelos(sel);
    renderRankPosts(comM.length ? lst : []);
    $('c-rc-b').classList.toggle('hidden', !geral);
    if (geral) renderRankCreators(lst);
    renderBiblioteca(lst);
  }

  function renderKpis(lst, comM) {
    const tv = temViews(lst), views = soma(lst, p => m(p, 'views'));
    const erMed = media(lst.map(er).filter(x => x != null));
    const ap = k => lst.some(p => (p.aprox || []).includes(k) && m(p, k) != null);
    const K = [
      ['Publicações', int(lst.length), `${int(lst.filter(p => p.status === 'atualizado' || p.status === 'parcial').length)} com métricas coletadas`],
      ['Visualizações', tv ? fmt(views, ap('views')) : '—', tv ? `média ${fmt(media(lst.map(p => m(p, 'views')).filter(x => x != null)))} por post` : 'Não disponível publicamente'],
      ['Curtidas', fmt(soma(lst, p => m(p, 'curtidas')), ap('curtidas')), 'soma das publicações'],
      ['Comentários', fmt(soma(lst, p => m(p, 'comentarios')), ap('comentarios')), 'soma das publicações'],
      ['Interações', fmt(soma(comM, inter), comM.some(interAprox)), comM.length ? `média ${fmt(media(comM.map(inter)))} por post` : 'sem métricas coletadas'],
    ];
    if (erMed != null) K.push(['Engajamento médio', fmtPct(erMed), 'interações ÷ visualizações']);
    $('c-kpis').innerHTML = K.map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v num">${v}</div><div class="vs">${s}</div></div>`).join('');
  }

  // ─── Insights: só com dados suficientes ──────────────────────────────────
  function renderInsights(lst, comM, geral, sel) {
    const I = [], nome = p => `«${esc(resumoLeg(p, 50) || p.id)}»${geral ? ` de ${esc(creatorDe(p))}` : ''}`;
    const usaViews = comM.filter(p => m(p, 'views') != null).length >= 3;
    const base = usaViews ? p => m(p, 'views') : inter, rot = usaViews ? 'visualizações' : 'interações';
    const ordenados = [...comM].sort((a, b) => inter(b) - inter(a));

    if (comM.length >= 2) {
      const t = ordenados[0];
      I.push(['Maior engajamento', `${nome(t)} foi o conteúdo com mais interações ${geral ? 'da biblioteca' : 'do creator'}: ${fmt(inter(t), interAprox(t))}.`, t.id]);
    }
    if (comM.length >= 3) {
      const cand = comM.filter(p => base(p) != null);
      const melhor = cand.map(p => {
        const outros = cand.filter(x => x !== p).map(base);
        const mu = media(outros);
        return {p, d: mu ? (base(p) - mu) / mu * 100 : null};
      }).filter(x => x.d != null).sort((a, b) => b.d - a.d)[0];
      if (melhor && melhor.d >= 30) I.push(['Acima da média', `${nome(melhor.p)} teve ${int(Math.round(melhor.d))}% mais ${rot} que a média dos demais posts.`, melhor.p.id]);
    }
    const porTipo = {};
    comM.forEach(p => { const t = tipoDe(p); if (t) (porTipo[t] ||= []).push(base(p)); });
    const tipos = Object.entries(porTipo).filter(([, v]) => v.filter(x => x != null).length >= 2)
      .map(([t, v]) => [t, media(v.filter(x => x != null))]).sort((a, b) => b[1] - a[1]);
    if (tipos.length >= 2 && tipos[tipos.length - 1][1] > 0) {
      const [t1, v1] = tipos[0], [t2, v2] = tipos[tipos.length - 1], d = (v1 - v2) / v2 * 100;
      const plural = t => ({Reel: 'Reels', Post: 'Posts', Carrossel: 'Carrosséis'}[t] || t);
      if (d >= 20) I.push(['Formatos', `${plural(t1)} geram em média ${int(Math.round(d))}% mais ${rot} que ${plural(t2).toLowerCase()} (${int(Math.round(v1))} vs ${int(Math.round(v2))} por post).`]);
    }
    const porCiclo = {};
    comM.filter(p => p.publicado_em).forEach(p => (porCiclo[P.cicloId(p.publicado_em)] ||= []).push(p));
    const ciclos = Object.entries(porCiclo).filter(([, v]) => v.length >= 2);
    if (ciclos.length >= 2) {
      const nomes = Object.fromEntries(P.listaCiclos().map(c => [c.id, c.nome]));
      const [cid, ps] = ciclos.sort((a, b) => soma(b[1], inter) - soma(a[1], inter))[0];
      I.push(['Período', `Conteúdos publicados no ciclo ${nomes[cid] || cid} tiveram o maior volume de interações: ${int(soma(ps, inter))} em ${ps.length} posts.`]);
    }
    if (geral) {
      const porCr = {};
      comM.forEach(p => (porCr[p.creator] ||= []).push(inter(p)));
      const cons = Object.entries(porCr).filter(([, v]) => v.length >= 3).map(([n, v]) => [n, cv(v)]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
      if (cons.length >= 2) I.push(['Consistência', `${esc(cons[0][0])} apresenta a performance mais consistente: as interações variam ${int(Math.round(cons[0][1] * 100))}% entre posts, contra ${int(Math.round(media(cons.map(x => x[1])) * 100))}% na média dos creators.`]);
    }
    const den = usaViews ? 'views' : 'curtidas';
    const razoes = comM.filter(p => m(p, 'comentarios') != null && m(p, den)).map(p => ({p, r: m(p, 'comentarios') / m(p, den)}));
    if (razoes.length >= 5) {
      const med = [...razoes].sort((a, b) => a.r - b.r)[Math.floor(razoes.length / 2)].r;
      const top = [...razoes].sort((a, b) => b.r - a.r)[0];
      if (med > 0 && top.r >= med * 2 && m(top.p, 'comentarios') >= 10) {
        const unid = usaViews ? 1000 : 100;
        I.push(['Conversa', `${nome(top.p)} teve muitos comentários em relação às ${usaViews ? 'visualizações' : 'curtidas'}: ${nBR(top.r * unid, 1)} a cada ${unid} ${usaViews ? 'views' : 'curtidas'} (mediana: ${nBR(med * unid, 1)}).`, top.p.id]);
      }
    }
    const crescendo = comM.map(p => {
      const h = (p.historico || []).filter(x => INTER.some(k => x[k] != null));
      if (h.length < 2) return null;
      const ult = h[h.length - 1], lim = new Date(new Date(ult.em) - 7 * 864e5);
      const ref = h.find(x => new Date(x.em) >= lim) || h[0];
      if (ref === ult) return null;
      const si = x => INTER.reduce((s, k) => s + (x[k] || 0), 0);
      return si(ref) ? {p, d: (si(ult) - si(ref)) / si(ref) * 100} : null;
    }).filter(x => x && x.d >= 10).sort((a, b) => b.d - a.d);
    if (crescendo.length) I.push(['Em crescimento', `${crescendo.length === 1 ? 'Um conteúdo continua' : int(crescendo.length) + ' conteúdos continuam'} crescendo. ${nome(crescendo[0].p)} ganhou ${int(Math.round(crescendo[0].d))}% de interações nos últimos 7 dias.`, crescendo[0].p.id]);

    $('c-ins').innerHTML = I.length
      ? I.map(([k, t, id]) => `<div class="insight"${id ? ` data-post="${esc(id)}" style="cursor:pointer"` : ''}><div class="k">${k}</div><p>${t}</p></div>`).join('')
      : '<div class="vazio" style="grid-column:1/-1">Ainda não há dados suficientes para gerar insights. Eles aparecem conforme a biblioteca ganha posts e coletas diárias.</div>';
  }

  // ─── Selos orgânicos ──────────────────────────────────────────────────────
  function renderSelos(sel) {
    const d = D(), meus = posts().filter(p => !d.admin || p.creator === sel);
    const S = [], selo = (ico, nm, ok, ds, prog = null) => S.push({ico, nm, ok, ds, prog});
    const primeiro = [...meus].sort((a, b) => (a.cadastrado_em || '').localeCompare(b.cadastrado_em || ''))[0];
    selo(ICO.estrela, 'Primeiro post cadastrado', !!primeiro, primeiro ? `Em ${dBR(primeiro.cadastrado_em.slice(0, 10))}` : 'Adicione sua primeira publicação');

    const tv = temViews(meus), totViews = soma(meus, p => m(p, 'views')) || 0;
    if (tv) METAS_VIEWS.forEach(v => selo(v >= 1e6 ? '1M' : `${v / 1000}k`, `${v >= 1e6 ? '1 milhão' : int(v / 1000) + ' mil'} de views`, totViews >= v,
      totViews >= v ? 'Alcançado' : `${int(totViews)} de ${int(v)}`, totViews >= v ? null : totViews / v));

    const destaque = meus.find(p => p.id === d.post_destaque);
    selo(ICO.trofeu, 'Post com maior engajamento', !!destaque, destaque ? `${resumoLeg(destaque, 40) || destaque.id} · mais interações da biblioteca` : 'Tenha o post com mais interações entre todos os creators');

    const OC = d.organico_ciclos || {}, cs = P.listaCiclos(), atual = cs[0];
    const pos = id => { const x = OC[id]; if (!x) return null; if (!Array.isArray(x)) return x; const i = x.indexOf(sel); return i < 0 ? null : {pos: i + 1, total: x.length}; };
    const venceu = cs.slice(1).filter(c => pos(c.id)?.pos === 1);
    const pa = pos(atual.id);
    selo(ICO.coroa, 'Creator destaque do mês', venceu.length > 0,
      venceu.length ? `${venceu.length}× · último em ${venceu[0].nome}` : pa ? `${pa.pos}º em interações no ciclo atual` : 'Lidere as interações de um ciclo fechado');

    const comPost = new Set(meus.filter(p => p.publicado_em).map(p => P.cicloId(p.publicado_em)));
    const serie = [...cs].reverse();
    let seq = 0, melhor = 0, atualSeq = 0;
    serie.forEach(c => { seq = comPost.has(c.id) ? seq + 1 : 0; melhor = Math.max(melhor, seq); });
    for (let i = serie.length - (comPost.has(atual.id) ? 1 : 2); i >= 0 && comPost.has(serie[i].id); i--) atualSeq++;
    selo(ICO.chama, '3 meses publicando com consistência', melhor >= 3, melhor >= 3 ? `Melhor sequência: ${melhor} ciclos` : `${atualSeq} de 3 ciclos seguidos com post`, melhor >= 3 ? null : atualSeq / 3);

    $('c-selos-n').textContent = `${S.filter(s => s.ok).length} de ${S.length} conquistados`;
    $('c-selos').innerHTML = S.map(s => `<div class="selo${s.ok ? '' : ' off'}"><div class="md">${s.ico}</div>
      <div class="nm">${esc(s.nm)}</div><div class="ds">${esc(s.ds)}</div>
      ${s.prog !== null ? `<div class="prog"><i style="width:${Math.min(100, s.prog * 100).toFixed(1)}%"></i></div>` : ''}</div>`).join('');
    $('c-selos-nota').textContent = tv ? '' : 'Os selos de 10 mil a 1 milhão de views dependem de visualizações, que o Instagram não exibe publicamente sem login. Eles aparecem assim que esse dado estiver disponível.';
  }

  // ─── Rankings ─────────────────────────────────────────────────────────────
  const tabsHTML = (opts, on) => opts.map(([k, l]) => `<button class="tab${k === on ? ' on' : ''}" type="button" data-k="${k}">${l}</button>`).join('');

  function renderRankPosts(lst) {
    const ops = [['views', 'Visualizações', p => m(p, 'views')], ['curtidas', 'Curtidas', p => m(p, 'curtidas')], ['comentarios', 'Comentários', p => m(p, 'comentarios')],
      ['compartilhamentos', 'Compartilhamentos', p => m(p, 'compartilhamentos')], ['er', 'Engajamento', er]];
    const disp = ops.filter(([, , f]) => lst.some(p => f(p) != null));
    if (!C.rp || !ops.some(o => o[0] === C.rp)) C.rp = (disp[0] || ops[1])[0];
    $('c-rp-tabs').innerHTML = tabsHTML(ops, C.rp);
    const [k, rot, f] = ops.find(o => o[0] === C.rp);
    const ord = lst.filter(p => f(p) != null).sort((a, b) => f(b) - f(a)).slice(0, 10);
    $('c-rp').innerHTML = ord.length ? ord.map((p, i) => {
      const v = k === 'er' ? fmtPct(f(p)) : fmtM(p, k);
      return `<button type="button" class="rk${i === 0 ? ' top1' : ''}" data-post="${esc(p.id)}">
        <span class="rkpos">${i + 1}º</span><span>${thumbHTML(p, 'th44')}</span>
        <span style="min-width:0"><div class="nm lim">${esc(resumoLeg(p, 70) || titulo(p))}</div><div class="meta">${esc(creatorDe(p))}${p.perfil ? ' · @' + esc(p.perfil) : ''} · ${esc(tipoDe(p) || '—')} · ${dBR(p.publicado_em)}</div></span>
        <span class="part num">${fmt(inter(p), interAprox(p))} interações</span>
        <span class="val"><div class="v num">${v}</div><div class="vs" style="font-size:12px;color:var(--muted)">${rot.toLowerCase()}</div></span>
      </button>`;
    }).join('') : `<div class="vazio">${lst.length ? `${rot} não ${k === 'er' ? 'pode ser calculado: depende de visualizações, que não são públicas' : 'são exibidos publicamente pelo Instagram'}.` : 'Nenhuma publicação com métricas coletadas.'}</div>`;
  }

  function renderRankCreators(lst) {
    const ultimos = P.listaCiclos().slice(0, 6).map(c => c.id);
    const g = {};
    lst.forEach(p => (g[p.creator] ||= []).push(p));
    const linhas = Object.entries(g).map(([nome, ps]) => {
      const cm = ps.filter(p => inter(p) != null), ers = ps.map(er).filter(x => x != null);
      const ciclosPost = new Set(ps.filter(p => p.publicado_em).map(p => P.cicloId(p.publicado_em)).filter(c => ultimos.includes(c)));
      return {nome, n: ps.length, views: soma(ps, p => m(p, 'views')), inter: soma(cm, inter), aprox: cm.some(interAprox),
        er: media(ers), cons: ciclosPost.size, cv: cv(cm.map(inter)),
        melhor: [...cm].sort((a, b) => inter(b) - inter(a))[0]};
    });
    const ops = [['views', 'Visualizações', x => x.views], ['er', 'Engajamento médio', x => x.er], ['inter', 'Interações', x => x.inter], ['cons', 'Consistência', x => x.cons]];
    const disp = ops.filter(([, , f]) => linhas.some(x => f(x) != null && f(x) !== 0));
    if (!C.rc || !ops.some(o => o[0] === C.rc)) C.rc = (disp[0] || ops[2])[0];
    $('c-rc-tabs').innerHTML = tabsHTML(ops, C.rc);
    const [k, rot, f] = ops.find(o => o[0] === C.rc);
    const ord = linhas.filter(x => f(x) != null).sort((a, b) => f(b) - f(a) || (k === 'cons' ? (a.cv ?? 9) - (b.cv ?? 9) : 0));
    $('c-rc').innerHTML = ord.length ? `<tr><th class="r">#</th><th>Creator</th><th class="r">Nº posts</th><th class="r">Views totais</th><th class="r">Interações</th><th class="r">Média de engajamento</th><th>Melhor post</th><th class="r">Consistência</th></tr>` +
      ord.map((x, i) => `<tr><td class="r num">${i + 1}º</td><td><a href="#" data-creator="${esc(x.nome)}" style="color:inherit;font-weight:600">${esc(x.nome)}</a></td>
        <td class="r num">${int(x.n)}</td><td class="r num">${fmt(x.views)}</td><td class="r num">${fmt(x.inter, x.aprox)}</td><td class="r num">${fmtPct(x.er)}</td>
        <td>${x.melhor ? `<span class="pcell" data-post="${esc(x.melhor.id)}">${thumbHTML(x.melhor, 'mini')}<span>${esc(resumoLeg(x.melhor, 34) || x.melhor.id)}</span></span>` : NA}</td>
        <td class="r num">${x.cons} de 6 ciclos</td></tr>`).join('')
      : `<tr><td class="vazio">${rot} não ${k === 'views' ? 'são exibidas publicamente pelo Instagram' : 'pode ser calculado sem visualizações públicas'}.</td></tr>`;
    $('c-rc-nota').textContent = k === 'cons' ? 'Consistência: ciclos com ao menos uma publicação entre os últimos 6. Empate: menor variação de interações entre posts.' : '';
    document.querySelectorAll('#c-rc [data-creator]').forEach(a => a.addEventListener('click', e => e.preventDefault()));
  }

  // ─── Biblioteca (cards e tabela) ──────────────────────────────────────────
  function ordenar(lst) {
    const f = {recente: p => dataRef(p), views: p => m(p, 'views'), curtidas: p => m(p, 'curtidas'), comentarios: p => m(p, 'comentarios'),
      compartilhamentos: p => m(p, 'compartilhamentos'), inter, er}[C.ordem];
    return [...lst].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return typeof x === 'string' ? y.localeCompare(x) : y - x;
    });
  }

  function renderBiblioteca(lst) {
    document.querySelectorAll('#c-modo .tab').forEach(t => t.classList.toggle('on', t.dataset.m === C.modo));
    $('c-cont').textContent = lst.length ? `${int(lst.length)} publicaç${lst.length === 1 ? 'ão' : 'ões'}` : '';
    const semDado = ['views', 'compartilhamentos', 'er'].includes(C.ordem) && !lst.some(p => (C.ordem === 'er' ? er(p) : m(p, C.ordem)) != null);
    const ord = ordenar(lst);
    if (!lst.length) { $('c-lib').innerHTML = '<div class="vazio">Nenhuma publicação encontrada com esses filtros.</div>'; return; }
    const aviso = semDado ? `<p class="nota" style="margin:0 0 14px">Ordenação indisponível: ${C.ordem === 'er' ? 'o engajamento depende de visualizações, que não são públicas' : 'este dado não é exibido publicamente pelo Instagram'}. Lista em ordem original.</p>` : '';
    if (C.modo === 'cards') {
      $('c-lib').innerHTML = aviso + '<div class="cards">' + ord.map(p => `<button type="button" class="pc" data-post="${esc(p.id)}">
        <div class="th">${thumbHTML(p)}${tipoDe(p) ? `<span class="chip">${esc(tipoDe(p))}</span>` : ''}</div>
        <div class="bd"><div class="cr">${esc(creatorDe(p))}</div>
          <div class="mt">${p.perfil ? '@' + esc(p.perfil) + ' · ' : ''}${dBR(p.publicado_em)}</div>
          <div class="lg">${esc(resumoLeg(p, 140) || '—')}</div>
          <div class="nums num"><span><b>${fmtM(p, 'curtidas')}</b> curtidas</span><span><b>${fmtM(p, 'comentarios')}</b> coment.</span>${m(p, 'views') != null ? `<span><b>${fmtM(p, 'views')}</b> views</span>` : ''}</div>
          <div style="margin-top:8px">${statusHTML(p)}</div>
        </div></button>`).join('') + '</div>';
    } else {
      $('c-lib').innerHTML = aviso + `<div class="tbl"><div class="tbl-scroll"><table><tr><th>Creator</th><th>Post</th><th>Data</th><th>Tipo</th><th class="r">Visualizações</th><th class="r">Curtidas</th><th class="r">Comentários</th><th class="r">Compartilhamentos</th><th class="r">Interações</th><th class="r">Engajamento</th><th>Status</th></tr>` +
        ord.map(p => `<tr><td>${esc(creatorDe(p))}</td><td><span class="pcell" data-post="${esc(p.id)}">${thumbHTML(p, 'mini')}<span>${esc(resumoLeg(p, 34) || p.id)}</span></span></td>
          <td class="num">${dBR(p.publicado_em)}</td><td>${esc(tipoDe(p) || '—')}</td><td class="r num">${fmtM(p, 'views')}</td><td class="r num">${fmtM(p, 'curtidas')}</td>
          <td class="r num">${fmtM(p, 'comentarios')}</td><td class="r num">${fmtM(p, 'compartilhamentos')}</td><td class="r num">${fmt(inter(p), interAprox(p))}</td><td class="r num">${fmtPct(er(p))}</td><td>${statusHTML(p)}</td></tr>`).join('') +
        '</table></div></div>';
    }
  }

  // ─── Card individual do post ──────────────────────────────────────────────
  function grafico(hist, k) {
    const pts = hist.filter(x => x[k] != null);
    if (pts.length < 2) return '';
    const W = 300, H = 120, pl = 4, pr = 4, pt = 14, pb = 18;
    const vs = pts.map(x => x[k]), lo = Math.min(...vs), hi = Math.max(...vs), rng = hi - lo || 1;
    const t0 = new Date(pts[0].em).getTime(), t1 = new Date(pts[pts.length - 1].em).getTime(), tr = t1 - t0 || 1;
    const X = x => pl + (new Date(x.em).getTime() - t0) / tr * (W - pl - pr), Y = v => pt + (1 - (v - lo) / rng) * (H - pt - pb);
    const d = pts.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(x[k]).toFixed(1)}`).join('');
    const dt = s => dBR(s.slice(0, 10)).slice(0, 5);
    return `<div class="hc"><div class="l">${MET[k]}</div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolução de ${MET[k].toLowerCase()}">
        <line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="#e7e7ea"/>
        <path d="${d}" fill="none" stroke="#0a0a0a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        ${pts.map(x => `<g><circle cx="${X(x).toFixed(1)}" cy="${Y(x[k]).toFixed(1)}" r="4" fill="#0a0a0a" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/>
          <circle cx="${X(x).toFixed(1)}" cy="${Y(x[k]).toFixed(1)}" r="12" fill="transparent"><title>${dBR(x.em.slice(0, 10))}: ${int(x[k])} ${MET[k].toLowerCase()}</title></circle></g>`).join('')}
        <text x="0" y="10" font-size="11" fill="#71717a">${int(hi)}</text>
        <text x="0" y="${H - 3}" font-size="11" fill="#71717a">${dt(pts[0].em)}</text>
        <text x="${W}" y="${H - 3}" font-size="11" fill="#71717a" text-anchor="end">${dt(pts[pts.length - 1].em)}</text>
      </svg></div>`;
  }

  function abrir(id) {
    const p = posts().find(x => x.id === id); if (!p) return;
    const i = inter(p), comps = INTER.filter(k => m(p, k) != null).map(k => MET[k].toLowerCase());
    const kv = [
      ['Visualizações', fmtM(p, 'views')], ['Curtidas', fmtM(p, 'curtidas')], ['Comentários', fmtM(p, 'comentarios')], ['Compartilhamentos', fmtM(p, 'compartilhamentos')],
      ['Reposts', fmtM(p, 'reposts')], ['Interações totais', fmt(i, interAprox(p))], ['Engagement rate', fmtPct(er(p))], ['Crescimento de views', fmtPct(crescViews(p))],
      ['Curtidas / 1.000 views', por1k(p, 'curtidas') == null ? NA : nBR(por1k(p, 'curtidas'), 1)], ['Comentários / 1.000 views', por1k(p, 'comentarios') == null ? NA : nBR(por1k(p, 'comentarios'), 1)],
      ['Compart. / 1.000 views', por1k(p, 'compartilhamentos') == null ? NA : nBR(por1k(p, 'compartilhamentos'), 1)],
    ];
    const hist = p.historico || [];
    const graf = ['views', 'curtidas', 'comentarios', 'compartilhamentos', 'reposts'].map(k => grafico(hist, k)).join('');
    const colsH = Object.keys(MET).filter(k => hist.some(x => x[k] != null));
    const origemTipo = p.tipo === 'Reel' ? 'identificado pelo link' : p.tipo_informado ? 'informado no cadastro' : p.tipo ? 'identificado na coleta' : '';
    $('c-dlg').innerHTML = `<div class="dlg">
      <div class="dlg-h"><div class="th">${thumbHTML(p)}</div>
        <div style="min-width:0;flex:1"><h3>${esc(titulo(p))}</h3>
          <dl class="dl">
            <dt>Creator</dt><dd>${esc(creatorDe(p))}${p.perfil ? ` · <a href="https://www.instagram.com/${esc(p.perfil)}/" target="_blank" rel="noopener" style="color:inherit">@${esc(p.perfil)}</a>` : ''}</dd>
            <dt>Publicado em</dt><dd>${p.publicado_em ? dBR(p.publicado_em) : '—'}</dd>
            <dt>Tipo</dt><dd>${esc(tipoDe(p) || '—')}${origemTipo ? ` <span style="color:var(--muted)">(${origemTipo})</span>` : ''}</dd>
            <dt>ID</dt><dd>${esc(p.id)}</dd>
            <dt>Cadastrado em</dt><dd>${quando(p.cadastrado_em)}</dd>
            <dt>Última atualização</dt><dd>${quando(p.ultima_coleta)} · ${statusHTML(p)}${p.erro ? ` <span style="color:var(--muted)">(${esc(p.erro)})</span>` : ''}</dd>
            <dt>Link</dt><dd><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:inherit">Abrir no Instagram ↗</a></dd>
          </dl></div>
        <button class="btn x" type="button" data-fechar aria-label="Fechar">✕</button></div>
      <div class="dlg-acoes">${lerPend().some(x => x.id === p.id && x.acao === 'excluir')
        ? '<span class="st">Exclusão em andamento</span>'
        : `<button class="btn btn-perigo" type="button" data-excluir="${esc(p.id)}">Excluir publicação</button>`}</div>
      ${p.legenda ? `<p class="leg">${esc(p.legenda)}</p>` : ''}
      <div class="kv">${kv.map(([l, v]) => `<div><div class="l">${l}</div><div class="v num">${v}</div></div>`).join('')}</div>
      <p class="nota" style="margin-top:0">${comps.length ? `Interações = ${comps.join(' + ')} (somente o que é público).` : 'Nenhuma métrica pública coletada ainda.'}${(p.aprox || []).length ? ' ≈ indica valor arredondado pelo próprio Instagram (ex.: 12K).' : ''} Métricas por views só são calculadas quando as visualizações estão disponíveis.</p>
      <h4>Evolução das métricas</h4>
      ${graf ? `<div class="hist">${graf}</div>` : `<p class="nota" style="margin:0 0 12px">${hist.length ? 'O gráfico aparece a partir da 2ª coleta (uma por dia).' : 'Sem coletas ainda.'}</p>`}
      ${hist.length ? `<div class="tbl"><div class="tbl-scroll"><table><tr><th>Data da coleta</th>${colsH.map(k => `<th class="r">${MET[k]}</th>`).join('')}</tr>` +
        [...hist].reverse().map(x => `<tr><td class="num">${quando(x.em)}</td>${colsH.map(k => `<td class="r num">${fmt(x[k])}</td>`).join('')}</tr>`).join('') + '</table></div></div>' : ''}
    </div>`;
    $('c-dlg').showModal();
  }

  window.PVC = {render};
})();
