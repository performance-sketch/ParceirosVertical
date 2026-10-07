#!/usr/bin/env python3
"""
instagram_post_provider.py — Parceiros Vertical

Recebe a URL de uma publicação do Instagram e devolve SOMENTE os dados que a página
pública entrega sem login. Nada é estimado: o que não estiver disponível volta como None.

Regras:
  - Sem login, senha ou cookies; user-agent identificado (não se passa por navegador nem por outro robô).
  - Se o Instagram pedir login ou bloquear, o resultado é "erro_coleta" — não há tentativa de contorno.

O que a página pública costuma entregar: @ do perfil, nome, data, legenda, capa, curtidas e comentários
(valores grandes arredondados, ex.: "12K").

Com META_IG_TOKEN definido, o @ descoberto na página é consultado na API oficial da Meta (Business Discovery,
pela conta @vertical.rio): visualizações, curtidas e comentários exatos e seguidores do perfil. Só funciona para
contas profissionais (Business/Creator) e posts entre os 50 mais recentes do perfil; fora disso valem os
números da página pública. Compartilhamentos e reposts não são públicos.
"""

import html
import os
import re
import time
from datetime import datetime

import requests

UA = "VerticalRioPortal/1.0 (+https://performance-sketch.github.io/ParceirosVertical/)"
TIPOS_URL = {"reel": "Reel", "reels": "Reel", "p": None, "tv": "Reel"}
_URL_RE = re.compile(r"^https?://(?:www\.|m\.)?instagram\.com/(?:[\w.]+/)?(p|reel|reels|tv)/([A-Za-z0-9_-]{5,40})/?(?:[?#].*)?$")
_META_RE = re.compile(r'<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"', re.I)
_DESC_RE = re.compile(
    r"^(?:(?P<likes>[\d.,]+[KMB]?) likes?, )?(?:(?P<com>[\d.,]+[KMB]?) comments? )?- (?P<user>[\w.]+) on (?P<data>[A-Z][a-z]+ \d{1,2}, \d{4})"
)

GRAPH = "https://graph.facebook.com/v21.0/17841404363695690"   # conta @vertical.rio (consulta Business Discovery)
CAMPOS_BD = ("business_discovery.username({u}){{username,followers_count,"
             "media.limit(50){{permalink,media_product_type,like_count,comments_count,view_count,timestamp}}}}")
_cache_bd = {}   # @ → (momento, resposta): uma consulta por perfil a cada 10 min atende vários posts dele

STATUS = {
    "atualizado": "Atualizado",
    "pendente": "Atualização pendente",
    "link_invalido": "Link inválido",
    "privado": "Conteúdo privado",
    "removido": "Conteúdo removido",
    "indisponivel": "Conteúdo privado ou removido",
    "parcial": "Métricas parcialmente disponíveis",
    "erro_coleta": "Erro de coleta",
}


def analisar_url(url):
    """Valida a URL e devolve {url, shortcode, tipo_url} normalizados, ou None se não for um post/reel."""
    m = _URL_RE.match((url or "").strip())
    if not m:
        return None
    caminho, code = m.group(1), m.group(2)
    caminho = "reel" if caminho in ("reel", "reels", "tv") else "p"
    return {"url": f"https://www.instagram.com/{caminho}/{code}/", "shortcode": code, "tipo_url": TIPOS_URL[caminho]}


def _numero(txt):
    """'1,234' → (1234, False); '12.5K' → (12500, True). O segundo valor indica arredondamento do Instagram."""
    if not txt:
        return None, False
    mult = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}.get(txt[-1])
    if mult:
        return int(round(float(txt[:-1].replace(",", "")) * mult)), True
    return int(txt.replace(",", "")), False


def perfil_api(usuario, sessao=None, timeout=15):
    """Business Discovery do @ (com cache curto). None se não houver token, a conta não for profissional ou a API falhar."""
    token = os.environ.get("META_IG_TOKEN")
    if not token or not usuario:
        return None
    c = _cache_bd.get(usuario)
    if c and time.time() - c[0] < 600:
        return c[1]
    try:
        r = (sessao or requests).get(GRAPH, params={"fields": CAMPOS_BD.format(u=usuario)},
                                     headers={"Authorization": f"Bearer {token}"}, timeout=timeout)
        bd = r.json().get("business_discovery")
    except (requests.RequestException, ValueError):
        bd = None
    _cache_bd[usuario] = (time.time(), bd)
    return bd


def _enriquecer(base, sessao):
    """Troca curtidas/comentários arredondados pelos exatos da API e acrescenta views e seguidores."""
    bd = perfil_api(base["perfil"], sessao)
    if not bd:
        return
    base["seguidores"] = bd.get("followers_count")
    m = next((x for x in (bd.get("media") or {}).get("data", []) if f"/{base['shortcode']}/" in x.get("permalink", "")), None)
    if not m:
        return
    base["metricas"].update(views=m.get("view_count"), curtidas=m.get("like_count", base["metricas"]["curtidas"]),
                            comentarios=m.get("comments_count", base["metricas"]["comentarios"]))
    base["aprox"] = []
    base["fonte"] = "api"
    if m.get("media_product_type") == "REELS":
        base["tipo"] = "Reel"


def coletar(url, sessao=None, timeout=20):
    """
    Retorna um dict com:
      status, url, shortcode, perfil, nome, tipo, publicado_em, legenda, thumb,
      metricas: {views, curtidas, comentarios, compartilhamentos, reposts}  (None = não disponível)
      aprox:    lista de métricas arredondadas pelo Instagram
    """
    info = analisar_url(url)
    if not info:
        return {"status": "link_invalido", "url": url}
    base = dict(info, perfil=None, nome=None, tipo=info["tipo_url"], publicado_em=None, legenda=None, thumb=None,
                metricas={"views": None, "curtidas": None, "comentarios": None, "compartilhamentos": None, "reposts": None},
                aprox=[], seguidores=None, fonte="pagina")
    del base["tipo_url"]
    s = sessao or requests
    try:
        r = s.get(info["url"], headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.8"}, timeout=timeout, allow_redirects=True)
    except requests.RequestException as e:
        return dict(base, status="erro_coleta", erro=type(e).__name__)
    if r.status_code == 404:
        return dict(base, status="removido")
    if "/accounts/login" in r.url or r.status_code in (401, 403, 429):
        return dict(base, status="erro_coleta", erro=f"bloqueado pelo Instagram (HTTP {r.status_code})")
    if r.status_code != 200:
        return dict(base, status="erro_coleta", erro=f"HTTP {r.status_code}")

    meta = {k.lower(): html.unescape(v) for k, v in _META_RE.findall(r.text)}
    desc = meta.get("description", "")
    d = _DESC_RE.match(desc)
    if meta.get("og:type") != "article" or not d:
        # Página respondeu, mas sem dados do post: o Instagram não diferencia privado de removido aqui
        return dict(base, status="indisponivel")

    curtidas, aprox_c = _numero(d.group("likes"))
    comentarios, aprox_m = _numero(d.group("com"))
    base["metricas"].update(curtidas=curtidas, comentarios=comentarios)
    base["aprox"] = [k for k, a in (("curtidas", aprox_c), ("comentarios", aprox_m)) if a]
    base["perfil"] = d.group("user")
    try:
        base["publicado_em"] = datetime.strptime(d.group("data"), "%B %d, %Y").date().isoformat()
    except ValueError:
        pass

    # Legenda: depois de '...: "' na description; o og:title traz o nome de exibição
    leg = re.search(r':\s*"(.*)"\s*\.?\s*$', desc, re.S)
    base["legenda"] = leg.group(1).strip() if leg else None
    tt = meta.get("twitter:title", "")
    nome = re.match(r"^(.*?) \(@[\w.]+\)", tt)
    base["nome"] = nome.group(1).strip() if nome else None
    if base["tipo"] is None:
        # O twitter:title termina com o formato: "Instagram reel"/"video" (Reel, inclusive em links /p/),
        # "Instagram photo" (Post) ou "Instagram photos and videos" (vários itens = Carrossel)
        if tt.endswith(("Instagram reel", "Instagram video")) or meta.get("og:video"):
            base["tipo"] = "Reel"
        elif tt.endswith("Instagram photos and videos"):
            base["tipo"] = "Carrossel"
        elif tt.endswith("Instagram photo"):
            base["tipo"] = "Post"
    base["thumb"] = meta.get("og:image") or meta.get("twitter:image")

    _enriquecer(base, sessao)
    disponiveis = sum(base["metricas"][k] is not None for k in ("curtidas", "comentarios"))
    return dict(base, status="atualizado" if disponiveis == 2 else "parcial")


if __name__ == "__main__":
    import json
    import sys
    for u in sys.argv[1:]:
        print(json.dumps(coletar(u), ensure_ascii=False, indent=2))
