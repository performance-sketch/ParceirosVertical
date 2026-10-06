#!/usr/bin/env python3
"""
instagram_post_provider.py — Parceiros Vertical

Recebe a URL de uma publicação do Instagram e devolve SOMENTE os dados que a página
pública entrega sem login. Nada é estimado: o que não estiver disponível volta como None.

Regras:
  - Sem login, senha ou cookies; user-agent identificado (não se passa por navegador nem por outro robô).
  - Se o Instagram pedir login ou bloquear, o resultado é "erro_coleta" — não há tentativa de contorno.

O que a página pública costuma entregar: @ do perfil, nome, data, legenda, capa, curtidas e comentários
(valores grandes arredondados, ex.: "12K"). Visualizações, compartilhamentos e reposts não são públicos.
"""

import html
import re
from datetime import datetime

import requests

UA = "VerticalRioPortal/1.0 (+https://performance-sketch.github.io/ParceirosVertical/)"
TIPOS_URL = {"reel": "Reel", "reels": "Reel", "p": None, "tv": "Reel"}
_URL_RE = re.compile(r"^https?://(?:www\.|m\.)?instagram\.com/(?:[\w.]+/)?(p|reel|reels|tv)/([A-Za-z0-9_-]{5,40})/?(?:[?#].*)?$")
_META_RE = re.compile(r'<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"', re.I)
_DESC_RE = re.compile(
    r"^(?:(?P<likes>[\d.,]+[KMB]?) likes?, )?(?:(?P<com>[\d.,]+[KMB]?) comments? )?- (?P<user>[\w.]+) on (?P<data>[A-Z][a-z]+ \d{1,2}, \d{4})"
)

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
                aprox=[])
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
        base["tipo"] = "Reel" if tt.endswith("Instagram video") or meta.get("og:video") else ("Post" if tt.endswith("Instagram photo") else None)
    base["thumb"] = meta.get("og:image") or meta.get("twitter:image")

    disponiveis = sum(v is not None for v in (curtidas, comentarios))
    return dict(base, status="atualizado" if disponiveis == 2 else "parcial")


if __name__ == "__main__":
    import json
    import sys
    for u in sys.argv[1:]:
        print(json.dumps(coletar(u), ensure_ascii=False, indent=2))
