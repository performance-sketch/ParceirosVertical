#!/usr/bin/env python3
"""
painel_dados.py — Parceiros Vertical · dados do Painel do creator

- Perfil de quem comprou (Rezdy): país, cidade, idioma, dia e hora da compra — só agregados.
- Rankings entre creators por dimensão e período (ciclos 26–25), com a distância para a próxima posição.
  O parceiro recebe só a própria posição e quanto falta; nomes e valores dos outros ficam só com o admin.
- Pagamentos de comissão registrados pelo admin, guardados criptografados (o repositório é público).
"""

import base64
import json
import os
import pathlib
from collections import Counter
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGAMENTOS = ROOT / "financeiro" / "pagamentos.enc.json"
FUSO = timezone(timedelta(hours=-3))          # America/Sao_Paulo (sem horário de verão desde 2019)
MIN_AGRUPAR = 2                               # cidades com menos compras entram em "Outras" (não identificar ninguém)
INTERACOES = ("curtidas", "comentarios", "compartilhamentos", "reposts")


# ─── Ciclos ───────────────────────────────────────────────────────────────────
def ciclo_de(data):
    y, m, d = map(int, data[:10].split("-"))
    if d >= 26:
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return f"{y}-{m:02d}"


def ciclo_anterior(c, n=1):
    y, m = map(int, c.split("-"))
    for _ in range(n):
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return f"{y}-{m:02d}"


def periodos(hoje=None):
    """Períodos fixos dos rankings: ciclo atual, ciclo anterior e últimos 3 ciclos (com o período de comparação)."""
    atual = ciclo_de((hoje or datetime.now(FUSO)).date().isoformat())
    seq = lambda fim, n: [ciclo_anterior(fim, i) for i in range(n)]
    return {
        "atual": (seq(atual, 1), seq(ciclo_anterior(atual), 1)),
        "anterior": (seq(ciclo_anterior(atual), 1), seq(ciclo_anterior(atual, 2), 1)),
        "3ciclos": (seq(atual, 3), seq(ciclo_anterior(atual, 3), 3)),
    }


# ─── Perfil de quem comprou ───────────────────────────────────────────────────
def dados_audiencia(booking):
    """Campos agregáveis de uma reserva do Rezdy (nada que identifique a pessoa)."""
    c = booking.get("customer") or {}
    dt = None
    try:
        dt = datetime.fromisoformat((booking.get("dateCreated") or "").replace("Z", "+00:00")).astimezone(FUSO)
    except ValueError:
        pass
    limpa = lambda v: (v or "").strip() or None
    return {"pais": (limpa(c.get("countryCode")) or "").upper() or None, "cidade": limpa(c.get("city")),
            "idioma": (limpa(c.get("preferredLanguage")) or "").lower() or None,
            "dow": dt.weekday() if dt else None, "hora": dt.hour if dt else None}


def agregar_audiencia(auds):
    """auds: lista de dados_audiencia. Devolve contagens; cidades raras viram "Outras"."""
    def top(campo, n=8, agrupar=False):
        c = Counter(a[campo] for a in auds if a.get(campo))
        if agrupar:
            outras = sum(v for k, v in c.items() if v < MIN_AGRUPAR)
            c = Counter({k: v for k, v in c.items() if v >= MIN_AGRUPAR})
            lista = [[k, v] for k, v in c.most_common(n)]
            return lista + ([["Outras", outras]] if outras else [])
        return [[k, v] for k, v in c.most_common(n)]
    return {
        "total": len(auds),
        "com_pais": sum(1 for a in auds if a.get("pais")),
        "com_cidade": sum(1 for a in auds if a.get("cidade")),
        "com_idioma": sum(1 for a in auds if a.get("idioma")),
        "paises": top("pais"), "cidades": top("cidade", agrupar=True), "idiomas": top("idioma"),
        "dias": [sum(1 for a in auds if a.get("dow") == d) for d in range(7)],          # 0 = segunda
        "horas": [sum(1 for a in auds if a.get("hora") == h) for h in range(24)],
    }


# ─── Rankings com distância ───────────────────────────────────────────────────
DIMENSOES = ("receita", "reservas", "engajamento", "crescimento", "consistencia")


def _interacoes(p):
    v = [p["metricas"].get(k) for k in INTERACOES if p.get("metricas", {}).get(k) is not None]
    return sum(v) if v else None


def rankings(reservas, posts, dono, logins, hoje=None):
    """{periodo: {dimensao: [[login, valor], ...]}} do 1º ao último. Só entra quem tem valor na dimensão."""
    atual = ciclo_de((hoje or datetime.now(FUSO)).date().isoformat())
    por_ciclo = {}
    for r in reservas:
        login = dono(r)
        if login in logins:
            t = por_ciclo.setdefault(login, {}).setdefault(ciclo_de(r["criado"]), [0.0, 0])
            t[0] += r["valor"]
            t[1] += 1
    posts_por = {}
    for p in posts:
        i = _interacoes(p)
        if i is not None and p.get("publicado_em") and p["login"] in logins:
            posts_por.setdefault(p["login"], []).append((ciclo_de(p["publicado_em"]), i))

    soma = lambda login, ciclos, k: sum(por_ciclo.get(login, {}).get(c, [0, 0])[k] for c in ciclos)
    saida = {}
    for nome, (ciclos, comparar) in periodos(hoje).items():
        dims = {d: [] for d in DIMENSOES}
        ultimos6 = [ciclo_anterior(ciclos[0], i) for i in range(6)]
        for login in logins:
            receita, reservas_n = soma(login, ciclos, 0), soma(login, ciclos, 1)
            if reservas_n:
                dims["receita"].append([login, round(receita, 2)])
                dims["reservas"].append([login, reservas_n])
            ints = [i for c, i in posts_por.get(login, []) if c in ciclos]
            if ints:
                dims["engajamento"].append([login, round(sum(ints) / len(ints), 1)])   # interações por post
            antes = soma(login, comparar, 0)
            if antes > 0 and (receita or antes):
                dims["crescimento"].append([login, round((receita - antes) / antes * 100, 1)])
            cons = sum(1 for c in ultimos6 if por_ciclo.get(login, {}).get(c, [0, 0])[1] > 0 and c <= atual)
            if cons:
                dims["consistencia"].append([login, cons])
        saida[nome] = {d: sorted(v, key=lambda x: (-x[1], x[0])) for d, v in dims.items()}
    return saida


def ranking_do_parceiro(rk, login):
    """Só a posição do parceiro, o total e quanto falta para a posição de cima — sem nomes nem valores dos outros."""
    out = {}
    for per, dims in rk.items():
        out[per] = {}
        for d, lst in dims.items():
            pos = next((i for i, (l, _) in enumerate(lst) if l == login), None)
            if pos is None:
                out[per][d] = {"pos": None, "total": len(lst)}
                continue
            # Empate divide a posição; "falta" é a distância até o próximo valor maior
            meu = lst[pos][1]
            acima = [v for _, v in lst if v > meu]
            alvo = min(acima) if acima else None
            out[per][d] = {"pos": len(acima) + 1, "total": len(lst), "valor": meu,
                           "falta": round(alvo - meu, 2) if acima else None,
                           "proxima": sum(1 for v in acima if v > alvo) + 1 if acima else None}   # posição a alcançar
    return out


def engajamento_referencia(posts, logins):
    """Interações médias por post de cada creator e a média entre creators (selo Engagement Master)."""
    medias = {}
    for login in logins:
        v = [_interacoes(p) for p in posts if p["login"] == login and _interacoes(p) is not None]
        if v:
            medias[login] = sum(v) / len(v)
    geral = sum(medias.values()) / len(medias) if len(medias) >= 2 else None
    return medias, geral


# ─── Pagamentos de comissão (criptografados) ──────────────────────────────────
def _chave_pagamentos():
    s = os.environ.get("PAGAMENTOS_CHAVE")
    if not s:
        return None
    import hashlib
    return hashlib.sha256(("pv-pagamentos:" + s).encode()).digest()


def carregar_pagamentos():
    chave = _chave_pagamentos()
    if not chave or not PAGAMENTOS.exists():
        return []
    env = json.loads(PAGAMENTOS.read_text(encoding="utf-8"))
    pt = AESGCM(chave).decrypt(base64.b64decode(env["iv"]), base64.b64decode(env["ct"]), None)
    return json.loads(pt)["pagamentos"]


def salvar_pagamentos(lista):
    chave = _chave_pagamentos()
    if not chave:
        raise RuntimeError("PAGAMENTOS_CHAVE não definida")
    iv = os.urandom(12)
    ct = AESGCM(chave).encrypt(iv, json.dumps({"pagamentos": lista}, ensure_ascii=False).encode(), None)
    PAGAMENTOS.parent.mkdir(exist_ok=True)
    b64 = lambda x: base64.b64encode(x).decode()
    PAGAMENTOS.write_text(json.dumps({"v": 1, "iv": b64(iv), "ct": b64(ct)}), encoding="utf-8")


def registrar_pagamento(env, admins, parceiros):
    """
    Pedido do admin pelo portal (mesmo caminho do envio de posts): tipo "pagamento",
    url "pv:pagamento:<ciclo AAAA-MM>:<valor>". Valor 0 desfaz o registro do ciclo.
    """
    signer, login = env["signer"].lower(), env["login"]
    if signer not in admins:
        return "recusado: só o admin registra pagamentos"
    if login not in parceiros:
        return "recusado: creator desconhecido"
    try:
        _, _, ciclo, valor = env["url"].split(":")
        datetime.strptime(ciclo, "%Y-%m")
        valor = round(float(valor), 2)
        assert valor >= 0
    except (ValueError, AssertionError):
        return "recusado: formato inválido"
    if not _chave_pagamentos():
        return "recusado: PAGAMENTOS_CHAVE não configurada"
    lista = [p for p in carregar_pagamentos() if not (p["login"] == login and p["ciclo"] == ciclo)]
    if valor > 0:
        lista.append({"login": login, "ciclo": ciclo, "valor": valor, "em": env["ts"][:19], "por": signer})
    salvar_pagamentos(sorted(lista, key=lambda p: (p["login"], p["ciclo"])))
    return f"pagamento de {login} em {ciclo}: {'R$ %.2f' % valor if valor else 'removido'}"
