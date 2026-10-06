#!/usr/bin/env python3
"""
instagram_sync.py — Parceiros Vertical · Biblioteca de Posts dos Creators

1. Lê os links enviados pelo portal (instagram/inbox/*.json, gravados pelo workflow receber-post.yml),
   confere a assinatura do envio (HMAC com a chave derivada da senha do parceiro) e registra o post.
2. Coleta as métricas públicas dos posts com coleta vencida via instagram_post_provider.
3. Guarda cada coleta no histórico (instagram/posts.json) e a capa em instagram/thumbs/.

A interface (index.html) só lê o que build_data.py publica — coleta e exibição ficam separadas.

Variáveis de ambiente: PARCEIROS_SENHAS (mesma do build_data.py)
"""

import hashlib
import hmac
import io
import json
import os
import pathlib
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import instagram_post_provider as provider  # noqa: E402
import painel_dados  # noqa: E402
from build_data import PBKDF2_ITER, ROOT, _load_env, salt_login  # noqa: E402

IG_DIR = ROOT / "instagram"
INBOX = IG_DIR / "inbox"
THUMBS = IG_DIR / "thumbs"
DB = IG_DIR / "posts.json"
MAX_COLETAS = 25            # por execução, para não sobrecarregar o Instagram
PAUSA = 3                   # segundos entre coletas
ENVIO_VALIDADE = timedelta(days=2)
TIPOS_INFORMADOS = {"", "Reel", "Post", "Carrossel"}
EXCLUIR = "excluir"   # no campo tipo: pedido de exclusão (mesmo caminho e assinatura do envio)
PAGAMENTO = "pagamento"   # no campo tipo: admin registra comissão paga (url = "pv:pagamento:<ciclo>:<valor>")
METRICAS = ("views", "curtidas", "comentarios", "compartilhamentos", "reposts")


def agora():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat(timespec="seconds")


# ─── Envios do portal ─────────────────────────────────────────────────────────
def chave(login, senha):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt_login(login), iterations=PBKDF2_ITER)
    return kdf.derive(senha.encode("utf-8"))


def assinatura_valida(env, senhas, admins, chaves):
    """O envio é assinado no navegador com a mesma chave que abre os dados do parceiro (espelha index.html)."""
    signer = (env.get("signer") or "").lower()
    if signer not in senhas or (signer != env.get("login") and signer not in admins):
        return False
    if signer not in chaves:
        chaves[signer] = chave(signer, senhas[signer])
    msg = "\n".join(str(env.get(k, "")) for k in ("signer", "login", "url", "tipo", "ts"))
    esperado = hmac.new(chaves[signer], msg.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, str(env.get("sig", "")))


def processar_inbox(db, config, senhas):
    parceiros = {k.lower() for k in config["parceiros"]}
    admins = {a.lower() for a in config.get("admins", ["admin"])}
    existentes = {p["id"] for p in db["posts"]}
    chaves = {}
    for arq in sorted(INBOX.glob("*.json")) if INBOX.exists() else []:
        try:
            env = json.loads(arq.read_text(encoding="utf-8"))
            env["login"] = (env.get("login") or "").lower()
            ts = datetime.fromisoformat(str(env.get("ts", "")).replace("Z", "+00:00"))
            motivo = None
            if not assinatura_valida(env, senhas, admins, chaves):
                motivo = "assinatura inválida"
            elif abs(agora() - ts) > ENVIO_VALIDADE:
                motivo = "envio expirado"
            elif env["login"] not in parceiros:
                motivo = "creator desconhecido"
            elif env.get("tipo", "") not in TIPOS_INFORMADOS | {EXCLUIR, PAGAMENTO}:
                motivo = "tipo inválido"
        except (ValueError, TypeError) as e:
            motivo = f"arquivo inválido ({e})"
        if motivo:
            print(f"  descartado {arq.name}: {motivo}")
            arq.unlink()
            continue

        if env.get("tipo") == PAGAMENTO:
            print("  " + painel_dados.registrar_pagamento(env, admins, parceiros))
            arq.unlink()
            continue
        info = provider.analisar_url(env["url"])
        if env.get("tipo") == EXCLUIR:
            excluir(db, env, info)
            existentes = {p["id"] for p in db["posts"]}
            arq.unlink()
            continue
        if info and info["shortcode"] in existentes:
            print(f"  já cadastrado: {info['shortcode']}")
        else:
            post = {
                "id": info["shortcode"] if info else "inv-" + hashlib.sha256(env["url"].encode()).hexdigest()[:10],
                "login": env["login"], "url": info["url"] if info else env["url"],
                "tipo_informado": env.get("tipo") or None, "tipo": info["tipo_url"] if info else None,
                "cadastrado_em": iso(ts), "cadastrado_por": env["signer"].lower(),
                "status": "pendente" if info else "link_invalido",
                "perfil": None, "nome": None, "publicado_em": None, "legenda": None, "thumb": None,
                "metricas": {m: None for m in METRICAS}, "aprox": [], "historico": [],
                "ultima_coleta": None, "ultima_tentativa": None, "erro": None,
            }
            db["posts"].append(post)
            existentes.add(post["id"])
            print(f"  novo post {post['id']} de {post['login']} ({post['status']})")
        arq.unlink()


def excluir(db, env, info):
    """Remove o post (e a capa) da biblioteca. Só o próprio creator — ou um admin em nome dele."""
    alvo = next((p for p in db["posts"]
                 if (info and p["id"] == info["shortcode"]) or p["url"] == env["url"]), None)
    if not alvo:
        print(f"  exclusão ignorada: {env['url']} não está na biblioteca")
    elif alvo["login"] != env["login"]:
        print(f"  exclusão recusada: {alvo['id']} pertence a outro creator")
    else:
        db["posts"].remove(alvo)
        (THUMBS / f"{alvo['id']}.jpg").unlink(missing_ok=True)
        print(f"  post {alvo['id']} excluído por {env['signer'].lower()}")


# ─── Coleta ───────────────────────────────────────────────────────────────────
def coleta_vencida(p, t):
    if p["status"] in ("link_invalido",):
        return False
    if p["status"] == "pendente" or not p.get("ultima_tentativa"):
        return True
    ultima = datetime.fromisoformat(p["ultima_tentativa"])
    if p["status"] in ("erro_coleta",):
        return t - ultima >= timedelta(hours=6)
    if p["status"] in ("removido", "indisponivel", "privado"):
        return t - ultima >= timedelta(days=3)
    publicado = p.get("publicado_em")
    recente = not publicado or (t.date() - datetime.fromisoformat(publicado).date()).days <= 60
    return t - ultima >= (timedelta(hours=23) if recente else timedelta(days=7))


def salvar_thumb(post_id, url, sessao):
    """Guarda a capa localmente: as URLs do CDN do Instagram expiram."""
    try:
        r = sessao.get(url, headers={"User-Agent": provider.UA}, timeout=20)
        r.raise_for_status()
        dados = r.content
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(dados)).convert("RGB")
            img.thumbnail((360, 360))
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=78, optimize=True)
            dados = buf.getvalue()
        except ImportError:
            pass
        THUMBS.mkdir(parents=True, exist_ok=True)
        (THUMBS / f"{post_id}.jpg").write_bytes(dados)
        return f"instagram/thumbs/{post_id}.jpg"
    except (requests.RequestException, OSError) as e:
        print(f"    capa não salva: {type(e).__name__}")
        return None


def coletar(db):
    t = agora()
    fila = [p for p in db["posts"] if coleta_vencida(p, t)]
    fila.sort(key=lambda p: (p["status"] != "pendente", p.get("ultima_tentativa") or ""))
    sessao = requests.Session()
    for i, p in enumerate(fila[:MAX_COLETAS]):
        if i:
            time.sleep(PAUSA)
        r = provider.coletar(p["url"], sessao)
        p["ultima_tentativa"] = iso(agora())
        p["status"] = r["status"]
        p["erro"] = r.get("erro")
        if r["status"] not in ("atualizado", "parcial"):
            print(f"  {p['id']}: {provider.STATUS[r['status']]}{' — ' + r['erro'] if r.get('erro') else ''}")
            continue
        for k in ("perfil", "nome", "publicado_em", "legenda"):
            if r.get(k) is not None:
                p[k] = r[k]
        p["tipo"] = r.get("tipo") or p.get("tipo")
        p["metricas"], p["aprox"] = r["metricas"], r["aprox"]
        p["ultima_coleta"] = p["ultima_tentativa"]
        hoje = p["ultima_coleta"][:10]
        ponto = dict({m: r["metricas"][m] for m in METRICAS}, em=p["ultima_coleta"])
        # Um ponto por dia: uma nova coleta no mesmo dia substitui a anterior
        if p["historico"] and p["historico"][-1]["em"][:10] == hoje:
            p["historico"][-1] = ponto
        else:
            p["historico"].append(ponto)
        if r.get("thumb") and not p.get("thumb"):
            p["thumb"] = salvar_thumb(p["id"], r["thumb"], sessao)
        print(f"  {p['id']}: {provider.STATUS[r['status']]} · {r['metricas']['curtidas']} curtidas · {r['metricas']['comentarios']} comentários")
    if len(fila) > MAX_COLETAS:
        print(f"  {len(fila) - MAX_COLETAS} coletas ficam para a próxima execução")


def main():
    _load_env()
    senhas_raw = os.environ.get("PARCEIROS_SENHAS")
    if not senhas_raw:
        sys.exit("Defina PARCEIROS_SENHAS")
    senhas = {k.strip().lower(): v for k, v in json.loads(senhas_raw).items()}
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))

    db = json.loads(DB.read_text(encoding="utf-8")) if DB.exists() else {"posts": []}
    antes = json.dumps(db, sort_keys=True)
    processar_inbox(db, config, senhas)
    coletar(db)
    if json.dumps(db, sort_keys=True) != antes:
        IG_DIR.mkdir(exist_ok=True)
        DB.write_text(json.dumps(db, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(db['posts'])} posts na biblioteca")


if __name__ == "__main__":
    main()
