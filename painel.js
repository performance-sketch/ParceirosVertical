/*
 * painel.js — Painel individual do creator (aba "Painel")
 *
 * Junta vendas (Rezdy), conteúdo (métricas públicas do Instagram), ranking, conquistas e o perfil
 * de quem comprou. Só usa dados reais: o que não existe aparece como "—" / "Não disponível",
 * e insights e recomendações só aparecem quando há dados mínimos.
 * O parceiro vê o próprio painel; o admin escolhe o creator e vê exatamente o que ele vê.
 */
(() => {
  const P = window.PV;
  const {$, esc, int, nBR, dBR, ICO} = P;
  const D = () => P.D;
  const NA = '<span class="na">—</span>';
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const DIAS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];          // 0 = segunda
  const DIAS_PL = ['segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos'];
  const DIAS_C = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const METAS = [5000, 10000, 25000, 50000];
  const VIRAL = 10000;            // curtidas (visualizações não são públicas)
  const SALES_MACHINE = 10;       // reservas em um ciclo
  const TEMAS = {
    'o Cristo Redentor': /cristo|redentor|christ the redeemer/i,
    'o Pão de Açúcar': /p[ãa]o de a[çc][úu]car|sugarloaf/i,
    'o pôr do sol': /p[ôo]r do sol|sunset|entardecer/i,
    'o voo de portas abertas': /portas? abertas?|doors?[- ]?off|sem portas/i,
    'as praias': /copacabana|ipanema|leblon|praia|beach/i,
  };
  const CTA = /reserv|link|book|agend|garant|cupom|c[óo]digo|code/i;
  const S = {per: 'ciclo', ini: '', fim: '', ordem: 'inter', rkPer: 'atual', rkDim: 'receita', ev: 'mes', aviso: '', montado: false};
  try { Object.assign(S, JSON.parse(sessionStorage.getItem('pv_painel') || '{}'), {aviso: '', montado: false}); } catch (_) {}
  const guardar = () => { try { sessionStorage.setItem('pv_painel', JSON.stringify({per: S.per, ini: S.ini, fim: S.fim, ordem: S.ordem, rkPer: S.rkPer, rkDim: S.rkDim, ev: S.ev})); } catch (_) {} };

  // ─── Utilidades ──────────────────────────────────────────────────────────
  const brl = v => 'R$ ' + nBR(v);
  const brl0 = v => 'R$ ' + nBR(Math.round(v), 0);
  const moeda = v => `<small>R$</small>${nBR(v)}`;
  const soma = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);
  const somaN = (l, f) => { const v = l.map(f).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dia = s => new Date(s + 'T12:00:00');
  const mais = (s, n) => { const d = dia(s); d.setDate(d.getDate() + n); return iso(d); };
  const hoje = () => iso(new Date());
  const nDias = (a, b) => Math.round((dia(b) - dia(a)) / 864e5) + 1;
  const dow = s => (dia(s).getDay() + 6) % 7;                 // 0 = segunda
  const m = (p, k) => p.metricas ? p.metricas[k] : null;
  const inter = p => window.PVC.inter(p);
  const tipoDe = p => window.PVC.tipoDe(p);
  const plural = t => ({Reel: 'Reels', Post: 'Posts', Carrossel: 'Carrosséis'}[t] || t);
  const artigo = t => ({Reel: 'um Reel', Post: 'um post', Carrossel: 'um carrossel'}[t] || 'um conteúdo');
  const vezes = r => r >= 2 ? `${nBR(r, 1)}x mais` : `${int(Math.round((r - 1) * 100))}% mais`;
  const leg = (p, n = 60) => { const t = (p.legenda || '').replace(/\s+/g, ' ').trim(); return t ? (t.length > n ? t.slice(0, n - 1) + '…' : t) : (p.perfil ? '@' + p.perfil : p.id); };
  const regiao = (() => { try { return new Intl.DisplayNames(['pt-BR'], {type: 'region'}); } catch (_) { return null; } })();
  const lingua = (() => { try { return new Intl.DisplayNames(['pt-BR'], {type: 'language'}); } catch (_) { return null; } })();
  const nomePais = c => { try { return regiao ? regiao.of(c) : c; } catch (_) { return c; } };
  const nomeLingua = c => { try { const n = lingua ? lingua.of(c) : c; return n.charAt(0).toUpperCase() + n.slice(1); } catch (_) { return c; } };
  const UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
  const DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const IC = {
    luz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/></svg>',
    alvo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  };

  // Variação: % (ou diferença absoluta, para contagens pequenas)
  function delta(a, b, {abs = false, unid = ''} = {}) {
    if (a == null || b == null) return '<span class="delta nul">—</span>';
    if (abs) {
      const d = a - b;
      if (!d) return '<span class="delta nul">= anterior</span>';
      return `<span class="delta ${d < 0 ? 'neg' : 'pos'}">${d < 0 ? DOWN : UP}${d > 0 ? '+' : '−'}${int(Math.abs(d))}${unid}</span>`;
    }
    if (!b) return a ? '<span class="delta pos">novo</span>' : '<span class="delta nul">—</span>';
    const v = (a - b) / b * 100;
    return `<span class="delta ${v < 0 ? 'neg' : 'pos'}">${v < 0 ? DOWN : UP}${v > 0 ? '+' : '−'}${nBR(Math.abs(Math.round(v * 10) / 10), Math.abs(v) < 10 ? 1 : 0)}%</span>`;
  }

  // ─── Ciclos (26–25) e períodos ───────────────────────────────────────────
  function ciclo(id) {
    const [y, mm] = id.split('-').map(Number);
    return {id, ini: iso(new Date(y, mm - 2, 26)), fim: iso(new Date(y, mm - 1, 25)), nome: `${MESES[mm - 1]}/${y}`, curto: `${MESES[mm - 1].slice(0, 3).toLowerCase()}/${String(y).slice(2)}`};
  }
  const cicloAnt = (id, n = 1) => { let [y, mm] = id.split('-').map(Number); mm -= n; while (mm < 1) { mm += 12; y--; } return `${y}-${pad(mm)}`; };
  const cicloAtual = () => P.cicloId(hoje());
  const faixa = (ini, fim, nome) => { const n = nDias(ini, fim); return {ini, fim, nome, ant: {ini: mais(ini, -n), fim: mais(ini, -1), nome: 'período anterior'}}; };

  function periodo() {
    const h = hoje(), c = cicloAtual();
    if (S.per === '7d') return faixa(mais(h, -6), h, 'Últimos 7 dias');
    if (S.per === '30d') return faixa(mais(h, -29), h, 'Últimos 30 dias');
    if (S.per === 'ciclo-ant') { const a = ciclo(cicloAnt(c)), b = ciclo(cicloAnt(c, 2)); return {ini: a.ini, fim: a.fim, nome: `Ciclo ${a.nome}`, ant: {ini: b.ini, fim: b.fim, nome: b.nome}}; }
    if (S.per === '3c') { const a = ciclo(cicloAnt(c, 2)), z = ciclo(c), b = ciclo(cicloAnt(c, 5)), y = ciclo(cicloAnt(c, 3)); return {ini: a.ini, fim: z.fim, nome: 'Últimos 3 ciclos', ant: {ini: b.ini, fim: y.fim, nome: '3 ciclos anteriores'}}; }
    if (S.per === 'custom' && S.ini && S.fim && S.ini <= S.fim) return faixa(S.ini, S.fim, `${dBR(S.ini)} – ${dBR(S.fim)}`);
    // Ciclo atual, comparado com o mesmo ponto do ciclo anterior (comparação justa com o ciclo em andamento)
    const z = ciclo(c), a = ciclo(cicloAnt(c)), corrido = nDias(z.ini, h);
    const fimAnt = mais(a.ini, corrido - 1);
    return {ini: z.ini, fim: z.fim, nome: `Ciclo ${z.nome}`, andamento: true, ant: {ini: a.ini, fim: fimAnt < a.fim ? fimAnt : a.fim, nome: `mesmo ponto de ${a.nome}`}};
  }

  // ─── Dados do creator (parceiro: o próprio; admin: o creator escolhido) ──
  function posicao(lst, nome) {          // espelha ranking_do_parceiro (painel_dados.py)
    const it = lst.find(x => x[0] === nome);
    if (!it) return {pos: null, total: lst.length};
    const meu = it[1], acima = lst.map(x => x[1]).filter(v => v > meu);
    const alvo = acima.length ? Math.min(...acima) : null;
    return {pos: acima.length + 1, total: lst.length, valor: meu, falta: alvo == null ? null : Math.round((alvo - meu) * 100) / 100,
      proxima: alvo == null ? null : acima.filter(v => v > alvo).length + 1};
  }

  function vm() {
    const d = D(); if (!d) return null;
    if (!d.admin) return {
      admin: false, nome: d.parceiro.nome, login: d.parceiro.login, cupons: d.parceiro.cupons || [],
      reservas: d.reservas, posts: d.posts || [], rk: d.rankings || {}, aud: d.audiencia || null,
      eng: d.engajamento_ref || {}, pag: d.pagamentos || [], topc: c => d.ranking_ciclos?.[c]?.pos ?? null,
    };
    const nome = P.parceiro; if (!nome) return null;
    const pc = (d.parceiros || []).find(p => p.nome === nome) || {};
    const rk = {};
    Object.entries(d.rankings || {}).forEach(([per, dims]) => {
      rk[per] = {};
      Object.entries(dims).forEach(([dim, lst]) => { rk[per][dim] = posicao(lst, nome); });
    });
    return {
      admin: true, nome, login: pc.login, cupons: pc.cupons || [],
      reservas: d.reservas.filter(r => r.parceiro === nome), posts: (d.posts || []).filter(p => p.creator === nome),
      rk, rkLista: d.rankings || {}, aud: (d.audiencia || {})[nome] || null,
      eng: {meu: d.engajamento_ref?.por_creator?.[nome] ?? null, media: d.engajamento_ref?.media ?? null},
      pag: (d.pagamentos || []).filter(p => p.nome === nome),
      topc: c => { const l = d.ranking_ciclos?.[c]; const i = l ? l.indexOf(nome) : -1; return i < 0 ? null : i + 1; },
    };
  }

  const comissao = r => r.valor * D().comissao_pct / 100;
  function resumo(v, a, b) {
    const rs = v.reservas.filter(r => r.criado >= a && r.criado <= b);
    const ps = v.posts.filter(p => p.publicado_em && p.publicado_em >= a && p.publicado_em <= b);
    const cm = ps.filter(p => inter(p) != null);
    return {
      rs, ps, res: rs.length, pax: soma(rs, r => r.pax), receita: soma(rs, r => r.valor), com: soma(rs, comissao),
      posts: ps.length, curt: somaN(ps, p => m(p, 'curtidas')), coment: somaN(ps, p => m(p, 'comentarios')),
      inter: somaN(cm, inter), ipp: cm.length ? soma(cm, inter) / cm.length : null,
    };
  }

  // Série por ciclo (do início do programa até hoje), em ordem cronológica
  function porCiclo(v) {
    const cs = P.listaCiclos().slice().reverse();
    return cs.map(c => {
      const rs = v.reservas.filter(r => r.criado >= c.ini && r.criado <= c.fim);
      const ps = v.posts.filter(p => p.publicado_em && p.publicado_em >= c.ini && p.publicado_em <= c.fim);
      return {...c, res: rs.length, receita: soma(rs, r => r.valor), com: soma(rs, comissao), posts: ps.length,
        inter: somaN(ps.filter(p => inter(p) != null), inter)};
    });
  }

  // ─── Gráfico de barras (uma série, um eixo; dica ao passar o mouse) ──────
  function grafico(titulo, pontos, fmt, destaque) {
    const max = Math.max(0, ...pontos.map(p => p.v));
    if (!pontos.length || !max) return `<div class="gc"><div class="l">${titulo}</div><div class="vazio-g">Sem dados no período</div></div>`;
    const W = 300, H = 120, n = pontos.length, gap = n > 24 ? 1 : n > 12 ? 2 : 4, bw = (W - gap * (n - 1)) / n;
    const barras = pontos.map((p, i) => {
      const h = p.v / max * (H - 6), x = i * (bw + gap);
      return `<g><title>${esc(p.dica)}: ${esc(fmt(p.v))}</title><rect class="hit" x="${x.toFixed(2)}" y="0" width="${(bw + gap).toFixed(2)}" height="${H}"/>` +
        (p.v ? `<rect class="b" x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${Math.max(h, 1.5).toFixed(2)}" rx="${Math.min(3, bw / 2).toFixed(1)}"/>` : '') + '</g>';
    }).join('');
    const pico = pontos.reduce((a, b) => b.v > a.v ? b : a);
    return `<div class="gc"><div class="l"><span>${titulo}</span><b>${esc(destaque ?? fmt(soma(pontos, p => p.v)))}</b></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(titulo)}">${barras}</svg>
      <div class="x"><span>${esc(pontos[0].rot)}</span><span>pico: ${esc(pico.rot)}</span><span>${esc(pontos[n - 1].rot)}</span></div></div>`;
  }

  // Agrupa a série de vendas do período: por dia (até 31 dias), por semana (até ~3 meses) ou por ciclo
  function serieVendas(v, per) {
    const fim = per.fim < hoje() ? per.fim : hoje(), dias = nDias(per.ini, fim);
    let baldes;
    if (dias <= 31) baldes = Array.from({length: dias}, (_, i) => { const d = mais(per.ini, i); return {ini: d, fim: d, rot: dBR(d).slice(0, 5)}; });
    else if (dias <= 100) baldes = Array.from({length: Math.ceil(dias / 7)}, (_, i) => { const a = mais(per.ini, i * 7), b = mais(a, 6); return {ini: a, fim: b < fim ? b : fim, rot: dBR(a).slice(0, 5)}; });
    else baldes = P.listaCiclos().slice().reverse().filter(c => c.fim >= per.ini && c.ini <= fim).map(c => ({ini: c.ini, fim: c.fim, rot: c.curto}));
    return baldes.map(b => {
      const rs = v.reservas.filter(r => r.criado >= b.ini && r.criado <= b.fim);
      return {...b, res: rs.length, receita: soma(rs, r => r.valor), com: soma(rs, comissao), dica: b.ini === b.fim ? dBR(b.ini) : `${dBR(b.ini)} – ${dBR(b.fim)}`};
    });
  }

  // ─── Comissão: gerada, paga (registrada pelo admin) e pendente ───────────
  function comissoes(v) {
    const atual = cicloAtual(), por = {};
    v.reservas.forEach(r => { const c = P.cicloId(r.criado); por[c] = (por[c] || 0) + comissao(r); });
    const pagos = Object.fromEntries(v.pag.map(p => [p.ciclo, p]));
    const fechados = [...new Set([...Object.keys(por), ...Object.keys(pagos)])].filter(c => c < atual).sort().reverse();
    return {
      por, pagos, fechados, andamento: por[atual] || 0,
      pago: soma(v.pag, p => p.valor),
      pendente: fechados.reduce((s, c) => s + Math.max(0, (por[c] || 0) - (pagos[c]?.valor || 0)), 0),
    };
  }

  // ─── Conquistas ──────────────────────────────────────────────────────────
  function conquistas(v, serie) {
    const L = [], add = (ico, nome, desc, ok, prog, falta, qtd) => L.push({ico, nome, desc, ok, prog: ok ? 1 : Math.max(0, Math.min(1, prog || 0)), falta, qtd});
    const ord = [...v.reservas].sort((a, b) => a.criado.localeCompare(b.criado));
    const total = soma(ord, r => r.valor);
    add(ICO.estrela, 'Primeira Reserva', ord.length ? `Primeira venda em ${dBR(ord[0].criado)}` : 'Realize sua primeira venda com o cupom', ord.length > 0, 0, 'Faça sua primeira venda para desbloquear');
    METAS.forEach(meta => {
      const nome = meta === 5000 ? 'Primeiros R$ 5 mil' : `R$ ${int(meta / 1000)} mil em Vendas`;
      let acc = 0, quando = null;
      ord.forEach(r => { acc += r.valor; if (!quando && acc >= meta) quando = r.criado; });
      add(`${meta / 1000}k`, nome, quando ? `Alcançado em ${dBR(quando)}` : `Gere ${brl0(meta)} em vendas`, total >= meta, total / meta,
        `Faltam ${brl(meta - total)} para desbloquear ${nome}.`, `${brl(total)} / ${brl0(meta)}`);
    });
    const comVenda = serie.filter(c => c.receita > 0);
    let recorde = null, quebrou = false;
    comVenda.forEach(c => { if (recorde && c.receita > recorde.receita) quebrou = true; if (!recorde || c.receita > recorde.receita) recorde = c; });
    const atual = serie[serie.length - 1];
    add(ICO.trofeu, 'Recorde de Faturamento', recorde ? `Melhor ciclo: ${brl(recorde.receita)} em ${recorde.nome}` : 'Supere seu melhor ciclo de vendas', quebrou,
      recorde && recorde !== atual ? atual.receita / recorde.receita : 0,
      recorde && recorde !== atual ? `Faltam ${brl(recorde.receita - atual.receita)} neste ciclo para bater seu recorde.` : 'Venda em mais de um ciclo e supere o primeiro.',
      recorde && recorde !== atual ? `${brl(atual.receita)} / ${brl(recorde.receita)}` : null);
    let seq = 0, melhor = 0;
    serie.forEach(c => { seq = c.res ? seq + 1 : 0; melhor = Math.max(melhor, seq); });
    let corrente = 0;
    for (let i = serie.length - (atual.res ? 1 : 2); i >= 0 && serie[i].res; i--) corrente++;
    add(ICO.chama, 'Creator Consistente', melhor >= 3 ? `${melhor} ciclos seguidos com vendas` : 'Venda em 3 ciclos seguidos', melhor >= 3, corrente / 3,
      `${3 - corrente === 1 ? 'Falta 1 ciclo' : `Faltam ${3 - corrente} ciclos`} seguido${3 - corrente === 1 ? '' : 's'} com vendas.`, `${corrente} / 3 ciclos`);
    const tops = serie.filter(c => c !== atual && c.res && (v.topc(c.id) || 99) <= 3);
    const posHoje = v.rk?.atual?.receita?.pos;
    add(ICO.coroa, 'Top Creator', tops.length ? `Top 3 em ${tops[tops.length - 1].nome}${tops.length > 1 ? ` e mais ${tops.length - 1}` : ''}` : 'Termine um ciclo entre os 3 maiores faturamentos', tops.length > 0,
      posHoje ? Math.min(1, 3 / posHoje) : 0, posHoje ? `Hoje você está em ${posHoje}º em faturamento neste ciclo.` : 'Termine um ciclo entre os 3 maiores faturamentos.', null);
    const maxCurt = Math.max(0, ...v.posts.map(p => m(p, 'curtidas') || 0));
    add('🔥', 'Conteúdo Viral', maxCurt >= VIRAL ? `Post com ${int(maxCurt)} curtidas` : `Um post com ${int(VIRAL)} curtidas`, maxCurt >= VIRAL, maxCurt / VIRAL,
      `Faltam ${int(VIRAL - maxCurt)} curtidas no seu melhor post.`, `${int(maxCurt)} / ${int(VIRAL)} curtidas`);
    const {meu, media: med} = v.eng || {};
    add(ICO.estrela, 'Engagement Master', meu != null && med != null ? `${int(Math.round(meu))} interações por post · média dos creators: ${int(Math.round(med))}` : 'Engajamento acima da média dos creators',
      meu != null && med != null && meu > med, meu && med ? meu / med : 0,
      meu != null && med != null ? `Faltam ${int(Math.ceil(med - meu + 1))} interações por post para passar a média.` : 'Cadastre posts para comparar seu engajamento.', null);
    const maxRes = Math.max(0, ...serie.map(c => c.res));
    add(ICO.ticket, 'Sales Machine', maxRes >= SALES_MACHINE ? `${maxRes} reservas em um ciclo` : `${SALES_MACHINE} reservas em um ciclo`, maxRes >= SALES_MACHINE,
      Math.max(atual.res, 0) / SALES_MACHINE, `Faltam ${SALES_MACHINE - atual.res} reservas neste ciclo para desbloquear Sales Machine.`, `${atual.res} / ${SALES_MACHINE} reservas`);
    const prim = [...v.posts].sort((a, b) => (a.cadastrado_em || '').localeCompare(b.cadastrado_em || ''))[0];
    add('📸', 'Primeiro Post', prim ? `Cadastrado em ${dBR((prim.cadastrado_em || '').slice(0, 10))}` : 'Cadastre sua primeira publicação', !!prim, 0, 'Cadastre uma publicação na aba Conteúdos.');
    return L;
  }

  // ─── Insights e recomendações (regras; só com dados suficientes) ─────────
  function analisar(v, serie) {
    const cm = v.posts.filter(p => inter(p) != null);
    const out = {ins: [], funciona: [], melhorar: [], formato: null, tema: null, dia: null};
    // Formatos
    const porTipo = {};
    cm.forEach(p => { const t = tipoDe(p); if (t) (porTipo[t] ||= []).push(inter(p)); });
    const tipos = Object.entries(porTipo).filter(([, a]) => a.length >= 2).map(([t, a]) => [t, media(a), a.length]).sort((a, b) => b[1] - a[1]);
    if (tipos.length >= 2 && tipos[tipos.length - 1][1] > 0) {
      const [t1, v1] = tipos[0], [t2, v2] = tipos[tipos.length - 1], r = v1 / v2;
      if (r >= 1.2) {
        out.formato = t1;
        out.ins.push(`Seus ${plural(t1)} geram <b>${vezes(r)}</b> interações que ${plural(t2).toLowerCase()} (média de ${int(Math.round(v1))} contra ${int(Math.round(v2))} por post).`);
        out.funciona.push(`${plural(t1)} (${vezes(r)} interações que ${plural(t2).toLowerCase()})`);
        const share = (porTipo[t1].length / cm.length) * 100;
        if (share < 40) out.melhorar.push(`Publicar mais ${plural(t1)}: hoje são só ${int(Math.round(share))}% dos seus posts`);
      }
    } else if (tipos.length === 1) out.formato = tipos[0][0];
    // Temas das legendas
    const temas = Object.entries(TEMAS).map(([nome, re]) => {
      const com = cm.filter(p => re.test(p.legenda || '')).map(inter), sem = cm.filter(p => !re.test(p.legenda || '')).map(inter);
      return com.length >= 2 && sem.length >= 2 && media(sem) > 0 ? {nome, r: media(com) / media(sem)} : null;
    }).filter(Boolean).sort((a, b) => b.r - a.r);
    if (temas.length && temas[0].r >= 1.25) {
      out.tema = temas[0].nome;
      out.ins.push(`Conteúdos mostrando ${temas[0].nome} tiveram <b>${vezes(temas[0].r)}</b> interações que os demais.`);
      out.funciona.push(`Conteúdos mostrando ${temas[0].nome}`);
    }
    // Dia da publicação
    const porDia = Array.from({length: 7}, () => []);
    cm.filter(p => p.publicado_em).forEach(p => porDia[dow(p.publicado_em)].push(inter(p)));
    const geral = media(cm.map(inter));
    const melhorDia = porDia.map((a, i) => [i, a.length >= 2 ? media(a) : null]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1])[0];
    if (cm.length >= 4 && melhorDia && geral && melhorDia[1] >= geral * 1.2) {
      out.dia = melhorDia[0];
      out.ins.push(`Seus conteúdos publicados às <b>${DIAS_PL[melhorDia[0]]}</b> têm o melhor desempenho médio: ${int(Math.round(melhorDia[1]))} interações por post.`);
      out.funciona.push(`Publicações às ${DIAS_PL[melhorDia[0]]}`);
    }
    // Frequência de publicação x vendas (correlação, não causa)
    const recentes = serie.slice(-6).filter(c => c.posts || c.res);
    const muitos = recentes.filter(c => c.posts >= 2), poucos = recentes.filter(c => c.posts < 2);
    if (recentes.length >= 4 && muitos.length >= 2 && poucos.length >= 2) {
      const a = media(muitos.map(c => c.receita)), b = media(poucos.map(c => c.receita));
      if (b > 0 && a / b >= 1.2) out.ins.push(`Nos ciclos em que você publicou 2 ou mais posts, suas vendas foram em média <b>${vezes(a / b)}</b> (${brl0(a)} contra ${brl0(b)}).`);
    }
    // Recorde
    const atual = serie[serie.length - 1], anteriores = serie.slice(0, -1).filter(c => c.receita > 0);
    if (anteriores.length) {
      const rec = anteriores.reduce((a, b) => b.receita > a.receita ? b : a);
      if (atual.receita > rec.receita) out.ins.push(`Você está <b>batendo seu recorde</b> de faturamento neste ciclo: ${brl(atual.receita)} (o anterior era ${brl(rec.receita)} em ${rec.nome}).`);
      else if (atual.receita > 0) out.ins.push(`Você está a <b>${brl(rec.receita - atual.receita)}</b> de atingir seu maior faturamento em um ciclo (${brl(rec.receita)} em ${rec.nome}).`);
    }
    // Dia das vendas
    if (v.reservas.length >= 10) {
      const n = Array(7).fill(0); v.reservas.forEach(r => n[dow(r.criado)]++);
      const top = n.indexOf(Math.max(...n)), share = n[top] / v.reservas.length;
      if (share >= 1.3 / 7) out.ins.push(`Suas vendas acontecem mais às <b>${DIAS_PL[top]}</b>: ${int(Math.round(share * 100))}% das suas reservas.`);
    }
    // Ranking
    const rr = v.rk?.atual?.receita;
    if (rr?.pos > 1 && rr.falta != null) out.ins.push(`Faltam <b>${brl(rr.falta)}</b> em vendas para você alcançar o ${rr.proxima}º lugar em faturamento neste ciclo.`);
    // Legendas: cupom e chamada para reserva
    const comLeg = v.posts.filter(p => p.legenda);
    const cupom = v.cupons[0];
    if (cupom && comLeg.length >= 2) {
      const citam = comLeg.filter(p => p.legenda.toUpperCase().includes(cupom.toUpperCase())).length;
      if (citam / comLeg.length < 0.5) {
        out.melhorar.push(`Reforçar seu cupom ${cupom} na legenda (está em ${citam} de ${comLeg.length} posts)`);
        if (citam === 0) out.ins.push(`Nenhum dos seus ${comLeg.length} posts cadastrados cita o cupom <b>${esc(cupom)}</b> na legenda.`);
      } else out.funciona.push(`Citar o cupom ${cupom} nas legendas`);
    }
    if (comLeg.length >= 2) {
      const semCta = comLeg.filter(p => !CTA.test(p.legenda)).length;
      if (semCta / comLeg.length > 0.5) out.melhorar.push(`Inserir uma chamada para reserva (ex.: "reserve pelo link") — falta em ${semCta} de ${comLeg.length} posts`);
    }
    // Frequência recente
    const h = hoje(), ult30 = v.posts.filter(p => p.publicado_em && p.publicado_em >= mais(h, -29)).length;
    const ultimo = v.posts.map(p => p.publicado_em).filter(Boolean).sort().pop();
    if (!v.posts.length) out.melhorar.push('Cadastrar suas publicações na aba Conteúdos para receber recomendações sobre o conteúdo');
    else if (ultimo && nDias(ultimo, h) > 14) out.melhorar.push(`Voltar a publicar: seu último post cadastrado é de ${dBR(ultimo)} (${nDias(ultimo, h) - 1} dias)`);
    else if (ult30 < 4) out.melhorar.push(`Aumentar a frequência: ${ult30} post${ult30 === 1 ? '' : 's'} nos últimos 30 dias (meta: 1 por semana)`);
    if (atual.res && serie.filter(c => c.res).length >= 3) {
      let seq = 0; for (let i = serie.length - 1; i >= 0 && serie[i].res; i--) seq++;
      if (seq >= 3) out.funciona.push(`Vender em ${seq} ciclos seguidos`);
    }
    return out;
  }

  function proximaAcao(v, a) {
    if (!v.posts.length && !v.reservas.length) return null;
    const partes = [`Publique ${a.formato ? artigo(a.formato) : 'um conteúdo'}`];
    if (a.tema) partes.push(`mostrando ${a.tema}`);
    if (a.dia != null) partes.push(`${a.dia >= 5 ? 'no' : 'na'} ${DIAS[a.dia]}`);
    const cupom = v.cupons[0];
    return `${partes.join(' ')} e inclua ${cupom ? `seu cupom ${cupom}` : 'seu link de reserva'} na legenda, com uma chamada para reservar o voo.`;
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  function render() {
    const d = D(); if (!d) return;
    const raiz = $('v-painel');
    $('h-ciclo').textContent = 'Painel do creator';
    const v = vm();
    if (!v) { raiz.innerHTML = escolherCreator(d); observar(); return; }
    const per = periodo(), A = resumo(v, per.ini, per.fim), B = resumo(v, per.ant.ini, per.ant.fim);
    const serie = porCiclo(v), cms = comissoes(v), conq = conquistas(v, serie), an = analisar(v, serie);
    raiz.innerHTML = [
      v.admin ? cabecalhoAdmin(d, v) : '',
      secVisao(v, per, A, B, conq, an),
      secVendas(v, per, A, B, serie, cms),
      secConteudo(v, per),
      secRanking(v),
      secConquistas(conq),
      secAudiencia(v),
      secInsights(an),
      secMelhorar(v, an),
      secEvolucao(serie),
    ].join('');
    observar();
    contar();
  }

  function escolherCreator(d) {
    const c = ciclo(cicloAtual());
    const ps = [...(d.parceiros || [])].map(p => {
      const rs = d.reservas.filter(r => r.parceiro === p.nome && r.criado >= c.ini && r.criado <= c.fim);
      return {...p, rec: soma(rs, r => r.valor), n: rs.length};
    }).sort((a, b) => b.rec - a.rec || a.nome.localeCompare(b.nome, 'pt-BR'));
    return `<section class="pn-sec on"><div class="pn-h"><h2>Painel do creator</h2><span class="sub">Escolha um creator para ver o painel exatamente como ele vê.</span></div>
      <div class="pn-escolha">${ps.map(p => `<button type="button" data-creator="${esc(p.nome)}"><b>${esc(p.nome)}</b><span>${esc(p.tipo || 'Parceiro')} · ${p.n ? `${brl0(p.rec)} no ciclo ${c.nome}` : 'sem vendas no ciclo'}</span></button>`).join('')}</div></section>`;
  }

  function cabecalhoAdmin(d, v) {
    const ps = [...(d.parceiros || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return `<div class="pn-adm"><span class="modo">Visão do administrador</span>
      <select id="pn-creator" aria-label="Creator">${ps.map(p => `<option${p.nome === v.nome ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <button class="btn" type="button" data-creator="">Ver todos</button>
      <span class="sub" style="font-size:13px;color:var(--muted)">Você está vendo o painel de ${esc(v.nome)} como ele(a) vê.</span></div>`;
  }

  // 1. Visão geral
  function secVisao(v, per, A, B, conq, an) {
    const chips = [['7d', '7 dias'], ['30d', '30 dias'], ['ciclo', 'Ciclo atual'], ['ciclo-ant', 'Ciclo anterior'], ['3c', '3 ciclos'], ['custom', 'Personalizado']];
    const prox = conq.filter(c => !c.ok && c.prog > 0).sort((a, b) => b.prog - a.prog)[0];
    const rk = v.rk?.atual || {};
    const posicoes = [['receita', 'faturamento'], ['reservas', 'reservas'], ['engajamento', 'engajamento'], ['crescimento', 'crescimento']]
      .filter(([k]) => rk[k]?.pos).map(([k, l]) => `<b>#${rk[k].pos}</b> em ${l}`);
    const destaque = [...v.posts].filter(p => inter(p) != null).sort((a, b) => inter(b) - inter(a))[0];
    const acao = proximaAcao(v, an);
    return `<section class="pn-sec" id="pn-visao">
      <div class="pn-chips" role="tablist" aria-label="Período">${chips.map(([k, l]) => `<button type="button" class="chip-p${S.per === k ? ' on' : ''}" data-per="${k}">${l}</button>`).join('')}</div>
      ${S.per === 'custom' ? `<div class="pn-datas"><input type="date" id="pn-ini" value="${S.ini}" aria-label="De"><input type="date" id="pn-fim" value="${S.fim}" aria-label="Até"></div>` : ''}
      <div class="hero-pn">
        <div class="eb">${esc(per.nome)}${per.andamento ? ' · em andamento' : ''}</div>
        <div class="big num" data-contar="${A.receita}" data-fmt="moeda0">${`<small>R$</small>${nBR(A.receita, 0)}`}</div>
        <div style="color:#d4d4d8;font-size:15px">em vendas com o seu cupom ${delta(A.receita, B.receita)} <span style="font-size:12px;color:#a1a1aa">vs ${esc(per.ant.nome)}</span></div>
        <div class="ganho">Você vai receber ${brl(A.com)}</div>
        <div class="dl"><span><b>${int(A.res)}</b> reserva${A.res === 1 ? '' : 's'} ${delta(A.res, B.res, {abs: true})}</span><span><b>${int(A.pax)}</b> passageiro${A.pax === 1 ? '' : 's'}</span>${posicoes.length ? `<span>${posicoes.join(' · ')} neste ciclo</span>` : ''}</div>
      </div>
      <div class="pn-grid">
        ${[
          ['Reservas', int(A.res), delta(A.res, B.res, {abs: true})],
          ['Passageiros', int(A.pax), delta(A.pax, B.pax, {abs: true})],
          ['Receita bruta', moeda(A.receita), delta(A.receita, B.receita)],
          ['Comissão', moeda(A.com), delta(A.com, B.com)],
          ['Posts publicados', int(A.posts), delta(A.posts, B.posts, {abs: true})],
          ['Curtidas', A.curt == null ? NA : int(A.curt), delta(A.curt, B.curt)],
          ['Comentários', A.coment == null ? NA : int(A.coment), delta(A.coment, B.coment)],
          ['Interações por post', A.ipp == null ? NA : int(Math.round(A.ipp)), delta(A.ipp, B.ipp)],
        ].map(([l, val, dl]) => `<div class="mc"><div class="l">${l}</div><div class="v num">${val}</div>${dl}</div>`).join('')}
      </div>
      <div class="indisp" title="O Instagram não exibe esses números sem login do creator">Não disponíveis publicamente no Instagram: <span>Visualizações</span><span>Compartilhamentos</span><span>Reposts</span><span>Taxa de engajamento</span></div>
      <div class="pn-grid" style="margin-top:14px">
        ${prox ? `<a class="mc" href="#pn-conq" data-ir="pn-conq" style="color:inherit;text-decoration:none"><div class="l">Próxima conquista</div><div class="v" style="font-size:17px;white-space:normal">${esc(prox.nome)}</div><div class="s">${esc(prox.falta || '')}</div></a>` : ''}
        ${destaque ? `<a class="mc" href="#pn-conteudo" data-ir="pn-conteudo" style="color:inherit;text-decoration:none"><div class="l">Conteúdo que mais engajou</div><div class="v" style="font-size:15px;white-space:normal">${esc(leg(destaque, 50))}</div><div class="s">${int(inter(destaque))} interações</div></a>` : ''}
        ${acao ? `<a class="mc" href="#pn-melhorar" data-ir="pn-melhorar" style="color:inherit;text-decoration:none;grid-column:span 2"><div class="l">O que publicar para vender mais</div><div class="v" style="font-size:15px;white-space:normal;line-height:1.4">${esc(acao)}</div></a>` : ''}
      </div>
    </section>`;
  }

  // 2. Vendas
  function secVendas(v, per, A, B, serie, cms) {
    const sv = serieVendas(v, per);
    const comVenda = serie.filter(c => c.receita > 0);
    const melhor = comVenda.length ? comVenda.reduce((a, b) => b.receita > a.receita ? b : a) : null;
    const n = Array(7).fill(0); v.reservas.forEach(r => n[dow(r.criado)]++);
    const diaTop = v.reservas.length >= 10 ? n.indexOf(Math.max(...n)) : null;
    const pcp = A.posts ? A.res / A.posts : null;
    const linhas = cms.fechados.slice(0, 6).map(c => {
      const ger = cms.por[c] || 0, pg = cms.pagos[c], cc = ciclo(c);
      const st = pg ? (pg.valor + 0.005 >= ger ? ['ok', 'Pago'] : ['pend', 'Pago em parte']) : ger ? ['pend', 'Pendente'] : ['', 'Sem comissão'];
      return `<div class="pc-row"><span class="c">${cc.nome}</span><span class="vv">Comissão ${brl(ger)}</span>
        ${pg ? `<span class="vv">Pago ${brl(pg.valor)} em ${dBR(pg.em.slice(0, 10))}</span>` : ''}<span class="tag-st ${st[0]}">${st[1]}</span>
        ${v.admin && v.login ? `<span class="acao">${pg ? `<button class="btn" type="button" data-pagar="${c}" data-valor="${pg.valor}">Alterar</button><button class="btn btn-perigo" type="button" data-desfazer="${c}">Desfazer</button>` : ger ? `<button class="btn btn-dark" type="button" data-pagar="${c}" data-valor="${ger.toFixed(2)}">Registrar pagamento</button>` : ''}</span>` : ''}
      </div>`;
    }).join('');
    return `<section class="pn-sec" id="pn-vendas">
      <div class="pn-h"><h2>Performance de vendas</h2><span class="sub">${esc(per.nome)} · vs ${esc(per.ant.nome)}</span></div>
      <div class="pn-grid">
        ${[
          ['Reservas', int(A.res), delta(A.res, B.res, {abs: true})],
          ['Passageiros', int(A.pax), delta(A.pax, B.pax, {abs: true})],
          ['Receita bruta', moeda(A.receita), delta(A.receita, B.receita)],
          ['Ticket médio por reserva', A.res ? moeda(A.receita / A.res) : NA, delta(A.res ? A.receita / A.res : null, B.res ? B.receita / B.res : null)],
          ['Ticket médio por passageiro', A.pax ? moeda(A.receita / A.pax) : NA, delta(A.pax ? A.receita / A.pax : null, B.pax ? B.receita / B.pax : null)],
          ['Comissão gerada', moeda(A.com), delta(A.com, B.com)],
        ].map(([l, val, dl]) => `<div class="mc"><div class="l">${l}</div><div class="v num">${val}</div>${dl}</div>`).join('')}
        <div class="mc"><div class="l">Comissão já paga</div><div class="v num">${moeda(cms.pago)}</div><div class="s">total registrado</div></div>
        <div class="mc"><div class="l">Comissão pendente</div><div class="v num">${moeda(cms.pendente)}</div><div class="s">ciclos fechados · + ${brl(cms.andamento)} no ciclo em andamento</div></div>
        <div class="mc"><div class="l">Reservas por post publicado</div><div class="v num">${pcp == null ? NA : nBR(pcp, 1)}</div><div class="s">não é conversão de cliques: o Instagram não informa visitas</div></div>
      </div>
      <div class="graf3">
        ${grafico('Reservas', sv.map(b => ({v: b.res, rot: b.rot, dica: b.dica})), x => int(x))}
        ${grafico('Receita', sv.map(b => ({v: b.receita, rot: b.rot, dica: b.dica})), brl0)}
        ${grafico('Comissão', sv.map(b => ({v: b.com, rot: b.rot, dica: b.dica})), brl0)}
      </div>
      ${melhor ? `<p class="frase">Seu melhor ciclo foi <em>${melhor.nome}</em>, com ${brl(melhor.receita)} em vendas e ${int(melhor.res)} reserva${melhor.res === 1 ? '' : 's'}.${diaTop != null ? ` Você vende mais às ${DIAS_PL[diaTop]}.` : ''}</p>` : ''}
      ${S.aviso ? `<p class="addmsg ok" style="margin-top:14px">${esc(S.aviso)}</p>` : ''}
      ${linhas ? `<div class="pn-h" style="margin-top:22px"><h2 style="font-size:17px">Comissão por ciclo</h2><span class="sub">${v.admin ? 'Registre aqui os pagamentos feitos ao creator' : 'Pagamentos registrados pela Vertical Rio'}</span></div><div class="pg-com">${linhas}</div>` : ''}
    </section>`;
  }

  // 3. Conteúdo
  function secConteudo(v, per) {
    const lista = v.posts;
    const comM = lista.filter(p => inter(p) != null);
    const topI = [...comM].sort((a, b) => inter(b) - inter(a))[0];
    const topC = [...comM].filter(p => m(p, 'comentarios') != null).sort((a, b) => m(b, 'comentarios') - m(a, 'comentarios'))[0];
    const rec = [...lista].sort((a, b) => (b.publicado_em || '').localeCompare(a.publicado_em || ''))[0];
    const dcard = (k, p, n) => p ? `<button type="button" class="dcard" data-post="${esc(p.id)}"><div class="th">${window.PVC.thumbHTML(p)}</div><div style="min-width:0"><div class="k">${k}</div><div class="t">${esc(leg(p, 48))}</div><div class="n">${n}</div></div></button>` : '';
    const f = {inter, curtidas: p => m(p, 'curtidas'), comentarios: p => m(p, 'comentarios'), recente: p => p.publicado_em || ''}[S.ordem] || inter;
    const ord = [...lista].sort((a, b) => { const x = f(a), y = f(b); if (x == null) return 1; if (y == null) return -1; return typeof x === 'string' ? y.localeCompare(x) : y - x; }).slice(0, 8);
    const card = p => `<button type="button" class="pc" data-post="${esc(p.id)}">
      <div class="th">${window.PVC.thumbHTML(p)}${tipoDe(p) ? `<span class="chip">${esc(tipoDe(p))}</span>` : ''}</div>
      <div class="bd"><div class="mt">Instagram · ${dBR(p.publicado_em)}</div>
        <div class="lg">${esc(leg(p, 120))}</div>
        <div class="nums num"><span><b>${m(p, 'curtidas') == null ? '—' : int(m(p, 'curtidas'))}</b> curtidas</span><span><b>${m(p, 'comentarios') == null ? '—' : int(m(p, 'comentarios'))}</b> coment.</span><span><b>${inter(p) == null ? '—' : int(inter(p))}</b> interações</span></div>
        <div class="mt" style="margin-top:6px">Views — · Compart. — · Reposts — · Engaj. —</div></div></button>`;
    return `<section class="pn-sec" id="pn-conteudo">
      <div class="pn-h"><h2>Performance de conteúdo</h2><span class="sub">${int(lista.length)} publicaç${lista.length === 1 ? 'ão' : 'ões'} cadastrada${lista.length === 1 ? '' : 's'}</span></div>
      ${lista.length ? `<div class="dest3">${dcard('Conteúdo com maior engajamento', topI, topI ? `${int(inter(topI))} interações` : '')}${dcard('Conteúdo mais comentado', topC !== topI ? topC : null, topC ? `${int(m(topC, 'comentarios'))} comentários` : '')}${dcard('Publicação mais recente', rec !== topI ? rec : null, rec ? dBR(rec.publicado_em) : '')}</div>
      <div class="pn-ord"><label for="pn-ordem" style="margin:0;font-size:13px;color:var(--muted)">Ordenar por</label>
        <select id="pn-ordem"><option value="inter"${S.ordem === 'inter' ? ' selected' : ''}>Maior engajamento</option><option value="curtidas"${S.ordem === 'curtidas' ? ' selected' : ''}>Mais curtidas</option>
        <option value="comentarios"${S.ordem === 'comentarios' ? ' selected' : ''}>Mais comentários</option><option value="recente"${S.ordem === 'recente' ? ' selected' : ''}>Mais recentes</option>
        <option disabled>Mais visualizados (não público)</option><option disabled>Mais compartilhamentos (não público)</option><option disabled>Mais reservas (não atribuídas por post)</option><option disabled>Maior receita (não atribuída por post)</option></select></div>
      <div class="cards">${ord.map(card).join('')}</div>
      ${lista.length > 8 ? '<div class="mais"><button class="btn" type="button" data-irview="conteudos">Ver todas na aba Conteúdos</button></div>' : ''}`
      : '<div class="vazio">Nenhuma publicação cadastrada ainda. Adicione seus posts na aba <b>Conteúdos</b>.</div>'}
      <p class="nota-pn">Reservas e receita não são atribuídas a posts específicos: a venda é ligada ao creator pelo cupom. "Conteúdo que mais vendeu" e "Maior faturamento" por post não são calculados.</p>
    </section>`;
  }

  // 4. Ranking
  const DIM = {
    receita: {l: 'Faturamento', val: x => brl0(x), falta: (f, p) => `Faltam ${brl(f)} em vendas para alcançar o ${p}º lugar.`},
    reservas: {l: 'Reservas', val: x => int(x), falta: (f, p) => `${f === 1 ? 'Falta 1 reserva' : `Faltam ${int(f)} reservas`} para alcançar o ${p}º lugar.`},
    engajamento: {l: 'Engajamento', sub: 'interações por post', val: x => int(Math.round(x)), falta: (f, p) => `Faltam ${int(Math.ceil(f))} interações por post para o ${p}º lugar.`},
    crescimento: {l: 'Crescimento', sub: 'receita vs período anterior', val: x => `${x > 0 ? '+' : ''}${nBR(x, 1)}%`, falta: (f, p) => `Faltam ${nBR(f, 1)} pontos percentuais para o ${p}º lugar.`},
    consistencia: {l: 'Consistência', sub: 'ciclos com venda (últimos 6)', val: x => `${x} de 6`, falta: (f, p) => `${f === 1 ? 'Falta 1 ciclo' : `Faltam ${int(f)} ciclos`} com vendas para o ${p}º lugar.`},
  };
  function secRanking(v) {
    const pers = [['atual', 'Ciclo atual'], ['anterior', 'Ciclo anterior'], ['3ciclos', 'Últimos 3 ciclos']];
    const rk = v.rk?.[S.rkPer] || {};
    const cards = Object.entries(DIM).map(([k, d]) => {
      const r = rk[k];
      if (!r || !r.pos) return `<div class="rkc na"><div class="l">${d.l}</div><div class="pos">—</div><div class="f">Sem dados neste período${r?.total ? ` (${r.total} creator${r.total === 1 ? '' : 's'} no ranking)` : ''}.</div></div>`;
      return `<div class="rkc${r.pos === 1 ? ' lider' : ''}"><div class="l">${d.l}</div><div class="pos">#${r.pos}<small>de ${r.total}</small></div>
        <div class="f">${r.pos === 1 ? 'Você lidera este ranking.' : esc(d.falta(r.falta, r.proxima))}</div>
        <div class="s" style="font-size:12px;color:${r.pos === 1 ? '#a1a1aa' : 'var(--muted)'};margin-top:6px">${d.sub ? d.sub + ': ' : ''}${esc(d.val(r.valor))}</div></div>`;
    }).join('') + '<div class="rkc na"><div class="l">Compartilhamentos</div><div class="pos">—</div><div class="f">Não disponível: o Instagram não exibe compartilhamentos sem login.</div></div>';
    let board = '';
    if (v.admin && v.rkLista?.[S.rkPer]) {
      const lst = v.rkLista[S.rkPer][S.rkDim] || [], d = DIM[S.rkDim];
      board = `<div class="pn-h" style="margin-top:20px"><h2 style="font-size:17px">Classificação completa</h2><span class="sub">visível só para o admin</span>
        <div class="tabs">${Object.entries(DIM).map(([k, x]) => `<button class="tab${S.rkDim === k ? ' on' : ''}" type="button" data-rkdim="${k}">${x.l}</button>`).join('')}</div></div>
        <div class="lb">${lst.map(([n, val]) => { const p = posicao(lst, n).pos; return `<div class="${n === v.nome ? 'eu' : ''}"><span class="p">${p}º</span><span>${esc(n)}</span><span class="vv">${esc(d.val(val))}</span></div>`; }).join('') || '<div>Sem dados neste período.</div>'}</div>`;
    }
    return `<section class="pn-sec" id="pn-ranking">
      <div class="pn-h"><h2>Ranking de creators</h2><div class="tabs">${pers.map(([k, l]) => `<button class="tab${S.rkPer === k ? ' on' : ''}" type="button" data-rkper="${k}">${l}</button>`).join('')}</div></div>
      <div class="rk-grid">${cards}</div>
      <p class="nota-pn">${v.admin ? '' : 'Você vê só a sua posição e quanto falta para a próxima — nomes e números dos outros creators não aparecem. '}Engajamento usa interações por post (curtidas + comentários), porque visualizações não são públicas.</p>
      ${board}
    </section>`;
  }

  // 5. Conquistas
  function secConquistas(conq) {
    const ok = conq.filter(c => c.ok).length;
    const prox = conq.filter(c => !c.ok && c.prog > 0).sort((a, b) => b.prog - a.prog)[0];
    const selo = c => `<div class="selo${c.ok ? '' : ' off'}"><div class="md">${c.ico}</div><div class="nm">${esc(c.nome)}</div><div class="ds">${esc(c.desc)}</div>
      ${!c.ok && c.qtd ? `<div class="q num">${esc(c.qtd)}</div>` : ''}${!c.ok && c.prog > 0 ? `<div class="prog"><i style="width:${(c.prog * 100).toFixed(1)}%"></i></div>` : ''}</div>`;
    return `<section class="pn-sec" id="pn-conq">
      <div class="pn-h"><h2>Conquistas</h2><span class="sub">${ok} de ${conq.length} desbloqueadas</span></div>
      ${prox ? `<div class="prox"><div class="md">${prox.ico}</div><div><div class="k">Próxima conquista</div><div class="t">${esc(prox.nome)}</div>
        <div class="bar"><i style="width:${(prox.prog * 100).toFixed(1)}%"></i></div><div class="q num">${prox.qtd ? esc(prox.qtd) + ' · ' : ''}${esc(prox.falta || '')}</div></div></div>` : ''}
      <div class="pn-h" style="margin:4px 0 10px"><h2 style="font-size:16px">Desbloqueadas</h2></div>
      <div class="selos pn-selos">${conq.filter(c => c.ok).map(selo).join('') || '<div class="vazio" style="grid-column:1/-1">Nenhuma ainda — a primeira está perto!</div>'}</div>
      <div class="pn-h" style="margin:18px 0 10px"><h2 style="font-size:16px">Ainda bloqueadas</h2></div>
      <div class="selos pn-selos">${conq.filter(c => !c.ok).map(selo).join('') || '<div class="vazio" style="grid-column:1/-1">Você desbloqueou todas!</div>'}</div>
    </section>`;
  }

  // 6. Perfil de quem comprou
  function secAudiencia(v) {
    const a = v.aud;
    const cab = `<div class="pn-h"><h2>Perfil de audiência</h2><span class="sub">Quem comprou com o seu cupom · dados do Rezdy, sempre agregados</span></div>`;
    if (!a || a.total < 5) return `<section class="pn-sec" id="pn-aud">${cab}<div class="vazio">Ainda há poucas compras para formar um perfil (mínimo de 5).</div></section>`;
    const barras = (lista, nome) => { const max = Math.max(...lista.map(x => x[1]), 1); return lista.map(([k, n]) => `<div class="hb"><span class="nm">${esc(nome(k))}</span><span class="num">${int(n)}</span><span class="hb-bar"><i style="width:${(n / max * 100).toFixed(1)}%"></i></span></div>`).join(''); };
    const bloco = (l, lista, nome, cob) => `<div class="ab"><div class="l">${l}</div>${lista.length ? barras(lista, nome) : '<div class="na">Sem dados</div>'}<div class="cob">${cob}</div></div>`;
    const topDia = a.dias.indexOf(Math.max(...a.dias)), topHora = a.horas.indexOf(Math.max(...a.horas));
    return `<section class="pn-sec" id="pn-aud">${cab}
      <div class="aud">
        ${bloco('Principais países', a.paises, k => k === 'Outras' ? k : nomePais(k), `País informado em ${int(a.com_pais)} de ${int(a.total)} compras`)}
        ${bloco('Principais cidades', a.cidades, k => k === 'Outras' ? 'Outras cidades' : k, `Cidade informada em ${int(a.com_cidade)} de ${int(a.total)} compras`)}
        ${bloco('Idioma', a.idiomas, nomeLingua, `Idioma informado em ${int(a.com_idioma)} de ${int(a.total)} compras`)}
      </div>
      <div class="graf3" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
        ${grafico('Dias com mais compras', a.dias.map((n, i) => ({v: n, rot: DIAS_C[i], dica: DIAS[i]})), x => `${int(x)} compras`, `mais às ${DIAS_PL[topDia]}`)}
        ${grafico('Horários com mais compras', a.horas.map((n, h) => ({v: n, rot: `${h}h`, dica: `${h}h–${h + 1}h`})), x => `${int(x)} compras`, `pico às ${topHora}h`)}
      </div>
      <div class="aud" style="margin-top:10px">
        <div class="ab na"><div class="l">Faixa etária</div>Não disponível: o Rezdy não coleta idade dos compradores.</div>
        <div class="ab na"><div class="l">Gênero</div>Não disponível: o Rezdy não coleta gênero dos compradores.</div>
        <div class="ab na"><div class="l">Seguidores no Instagram</div>Não disponível sem acesso à conta do creator.</div>
      </div>
      <p class="nota-pn">Horário de Brasília, pela hora em que a reserva foi feita. Cidades com uma única compra entram em "Outras cidades".</p>
    </section>`;
  }

  // 7. Insights
  function secInsights(an) {
    return `<section class="pn-sec" id="pn-insights">
      <div class="pn-h"><h2>Insights para melhorar sua performance</h2><span class="sub">gerados automaticamente a partir dos seus dados</span></div>
      <div class="ins-pn">${an.ins.length ? an.ins.map(t => `<div class="ip"><span class="ic">${IC.luz}</span><p>${t}</p></div>`).join('')
        : '<div class="vazio">Ainda não há dados suficientes para conclusões. Os insights aparecem conforme você vende e cadastra publicações.</div>'}</div>
      <p class="nota-pn">Comparações mostram associação, não causa. Cada insight só aparece com um mínimo de dados (ex.: 2 posts por formato).</p>
    </section>`;
  }

  // 8. Como melhorar
  function secMelhorar(v, an) {
    const acao = proximaAcao(v, an);
    const li = l => l.length ? `<ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="nota-pn" style="margin:0">Ainda sem dados suficientes.</p>';
    return `<section class="pn-sec" id="pn-melhorar">
      <div class="pn-h"><h2>Como melhorar</h2></div>
      <div class="cm"><div class="col"><h3>O que está funcionando</h3>${li(an.funciona)}</div><div class="col"><h3>O que pode melhorar</h3>${li(an.melhorar)}</div></div>
      ${acao ? `<div class="acao-rec"><div class="k">Próxima ação recomendada</div><p>${esc(acao)}</p></div>` : ''}
    </section>`;
  }

  // 9. Evolução
  function secEvolucao(serie) {
    const modos = [['mes', 'Atual × anterior'], ['3', 'Últimos 3 ciclos'], ['6', 'Últimos 6 ciclos']];
    const ult = serie.slice(-(S.ev === 'mes' ? 2 : +S.ev));
    const met = [['posts', 'Posts', x => int(x)], ['inter', 'Interações', x => int(x)], ['res', 'Reservas', x => int(x)], ['receita', 'Receita', brl0], ['com', 'Comissão', brl0]];
    let corpo;
    if (S.ev === 'mes' && ult.length) {
      const [a, b] = ult.length === 2 ? [ult[1], ult[0]] : [ult[0], null];
      corpo = `<div class="ev-cmp">${met.map(([k, l, f]) => `<div class="mc"><div class="l">${l}</div><div class="v num">${a[k] == null ? '—' : esc(f(a[k]))}</div>
        <div class="ant">${b ? `${b.nome}: ${b[k] == null ? '—' : esc(f(b[k]))}` : ''}</div>${b ? delta(a[k], b[k], {abs: k === 'posts' || k === 'res'}) : ''}</div>`).join('')}
        <div class="mc"><div class="l">Visualizações</div><div class="v">${NA}</div><div class="ant">não públicas no Instagram</div></div></div>
        <p class="nota-pn">${a.nome} (em andamento) comparado com ${b ? b.nome + ' completo' : '—'}.</p>`;
    } else {
      corpo = `<div class="graf-ev">${met.map(([k, l, f]) => grafico(l, ult.map(c => ({v: c[k] || 0, rot: c.curto, dica: c.nome})), f)).join('')}
        <div class="gc"><div class="l">Visualizações</div><div class="vazio-g">Não públicas no Instagram</div></div></div>`;
    }
    return `<section class="pn-sec" id="pn-evolucao">
      <div class="pn-h"><h2>Sua evolução</h2><div class="tabs">${modos.map(([k, l]) => `<button class="tab${S.ev === k ? ' on' : ''}" type="button" data-ev="${k}">${l}</button>`).join('')}</div></div>
      ${corpo}
    </section>`;
  }

  // ─── Microanimações ──────────────────────────────────────────────────────
  const semMovimento = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function observar() {
    const secs = [...document.querySelectorAll('#v-painel .pn-sec:not(.on)')];
    if (!('IntersectionObserver' in window) || semMovimento()) { secs.forEach(s => s.classList.add('on')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } }), {threshold: 0.08});
    secs.forEach(s => io.observe(s));
  }
  function contar() {
    if (semMovimento()) return;
    document.querySelectorAll('#v-painel [data-contar]').forEach(el => {
      const alvo = +el.dataset.contar, t0 = performance.now();
      const passo = t => {
        const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
        el.innerHTML = `<small>R$</small>${nBR(alvo * e, 0)}`;
        if (k < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
  }

  // ─── Pagamento de comissão (admin) ───────────────────────────────────────
  const lerValor = t => { t = String(t).trim().replace(/[R$\s]/g, ''); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); return parseFloat(t); };
  async function pagamento(cicloId, valorPadrao, desfazer) {
    const v = vm(); if (!v || !v.admin || !v.login) return;
    const cc = ciclo(cicloId);
    let valor = 0;
    if (desfazer) { if (!confirm(`Desfazer o registro de pagamento de ${v.nome} no ciclo ${cc.nome}?`)) return; }
    else {
      const t = prompt(`Valor pago a ${v.nome} referente ao ciclo ${cc.nome} (R$):`, nBR(+valorPadrao));
      if (t === null) return;
      valor = lerValor(t);
      if (!(valor > 0)) { alert('Valor inválido.'); return; }
    }
    try {
      await window.PVC.enviarAssinado({signer: P.login, login: v.login, url: `pv:pagamento:${cicloId}:${valor.toFixed(2)}`, tipo: 'pagamento', ts: new Date().toISOString()});
      S.aviso = `${desfazer ? 'Desfazendo' : 'Registrando'} pagamento de ${cc.nome}… o painel atualiza sozinho em cerca de 30 segundos.`;
      render();
      esperar(v.nome, cicloId, valor);
    } catch (_) { alert('Não foi possível enviar agora. Tente novamente em instantes.'); }
  }
  function esperar(nome, cicloId, valor, tentativa = 0) {
    setTimeout(async () => {
      await P.recarregar(tentativa < 6);     // lê direto do repositório nas primeiras tentativas
      const p = (D().pagamentos || []).find(x => (x.nome || nome) === nome && x.ciclo === cicloId);
      const ok = valor ? p && Math.abs(p.valor - valor) < 0.01 : !p;
      if (ok) { S.aviso = valor ? `Pagamento de ${ciclo(cicloId).nome} registrado.` : `Registro de ${ciclo(cicloId).nome} desfeito.`; render(); setTimeout(() => { S.aviso = ''; render(); }, 6000); }
      else if (tentativa < 12) esperar(nome, cicloId, valor, tentativa + 1);
      else { S.aviso = 'O registro está demorando mais que o normal. Ele aparece na próxima atualização automática (até 15 min).'; render(); }
    }, tentativa ? 10000 : 25000);
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────
  function montar() {
    const raiz = $('v-painel');
    raiz.addEventListener('click', e => {
      const t = e.target.closest('[data-per],[data-rkper],[data-rkdim],[data-ev],[data-post],[data-creator],[data-pagar],[data-desfazer],[data-ir],[data-irview]');
      if (!t) return;
      const ds = t.dataset;
      if (ds.per) { S.per = ds.per; if (ds.per === 'custom' && !S.ini) { S.fim = hoje(); S.ini = mais(S.fim, -29); } }
      else if (ds.rkper) S.rkPer = ds.rkper;
      else if (ds.rkdim) S.rkDim = ds.rkdim;
      else if (ds.ev) S.ev = ds.ev;
      else if (ds.post) return window.PVC.abrir(ds.post);
      else if ('creator' in ds) { P.setParceiro(ds.creator); window.scrollTo({top: 0, behavior: 'smooth'}); return; }
      else if (ds.pagar) return pagamento(ds.pagar, ds.valor, false);
      else if (ds.desfazer) return pagamento(ds.desfazer, 0, true);
      else if (ds.ir) { e.preventDefault(); document.getElementById(ds.ir)?.scrollIntoView({behavior: semMovimento() ? 'auto' : 'smooth'}); return; }
      else if (ds.irview) { document.querySelector(`#views [data-v="${ds.irview}"]`)?.click(); return; }
      guardar(); render();
    });
    raiz.addEventListener('change', e => {
      if (e.target.id === 'pn-ordem') { S.ordem = e.target.value; guardar(); render(); }
      else if (e.target.id === 'pn-creator') P.setParceiro(e.target.value);
      else if (e.target.id === 'pn-ini' || e.target.id === 'pn-fim') { S.ini = $('pn-ini').value; S.fim = $('pn-fim').value; guardar(); render(); }
    });
    S.montado = true;
  }

  window.PVP = {render: () => { if (!S.montado) montar(); render(); }};
})();
