#!/usr/bin/env python3
"""
build_data.py — Parceiros Vertical

Busca reservas CONFIRMADAS com cupom no Rezdy e gera, para cada parceiro,
um arquivo criptografado (AES-GCM, chave derivada da senha via PBKDF2) em data/.
O site estático (index.html) descriptografa no navegador após o login.

Variáveis de ambiente:
  REZDY_API_KEY      chave da API Rezdy
  PARCEIROS_SENHAS   JSON {"admin": "senha", "<login>": "senha", ...}
"""

import base64
import hashlib
import hmac
import json
import os
import pathlib
import sys
import time
from datetime import datetime, timezone

import requests
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
REZDY_BASE = "https://api.rezdy.com/v1"
PBKDF2_ITER = 250_000


def _load_env():
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ─── Rezdy ────────────────────────────────────────────────────────────────────
def buscar_reservas(api_key, data_inicio):
    """Rezdy devolve as reservas da mais nova para a mais antiga; pagina até passar de data_inicio."""
    todas, offset = [], 0
    while True:
        for tentativa in range(4):
            try:
                resp = requests.get(f"{REZDY_BASE}/bookings", params={
                    "apiKey": api_key, "limit": 100, "offset": offset,
                }, timeout=30)
                if resp.status_code == 429:
                    time.sleep(2 ** tentativa)
                    continue
                resp.raise_for_status()
                break
            except requests.RequestException:
                if tentativa == 3:
                    raise
                time.sleep(2 ** tentativa)
        lote = resp.json().get("bookings", [])
        if not lote:
            break
        todas.extend(lote)
        if len(lote) < 100 or (lote[-1].get("dateCreated") or "")[:10] < data_inicio:
            break
        offset += 100
        time.sleep(0.1)
    print(f"{len(todas)} reservas recuperadas do Rezdy")
    return todas


def extrair_reservas_cupom(reservas, data_inicio, pedidos=frozenset()):
    """Somente CONFIRMED com cupom (ou pedido atribuído manualmente). Sem dados pessoais do cliente (LGPD)."""
    saida = []
    for b in reservas:
        cupom = (b.get("coupon") or "").strip().upper()
        pedido = (b.get("orderNumber") or "").upper()
        if b.get("status") != "CONFIRMED" or not (cupom or pedido in pedidos):
            continue
        criado = (b.get("dateCreated") or "")[:10]
        if criado < data_inicio:
            continue
        itens = b.get("items", [])
        pax = sum(
            sum(q.get("value", 0) for q in item.get("quantities", []))
            for item in itens
        ) or sum(i.get("totalQuantity", 1) for i in itens)
        saida.append({
            "n": b.get("orderNumber", ""),
            "cupom": cupom or "PEDIDO",
            "criado": criado,
            "voo": (itens[0].get("startTimeLocal") or "")[:10] if itens else "",
            "produto": itens[0].get("productName", "-") if itens else "-",
            "pax": pax,
            "valor": round(float(b.get("totalAmount", 0) or 0), 2),
        })
    saida.sort(key=lambda r: r["criado"], reverse=True)
    return saida


# ─── Criptografia ─────────────────────────────────────────────────────────────
def nome_arquivo(login):
    return hashlib.sha256(f"pv-file:{login}".encode()).hexdigest()[:24] + ".json"


def salt_login(login):
    # Salt determinístico por login: a chave derivada fica estável entre builds,
    # o que permite ao navegador recarregar os dados sem pedir a senha de novo.
    return hashlib.sha256(f"pv-salt:{login}".encode()).digest()[:16]


def assinatura(payload, senha):
    # HMAC do conteúdo (sem o carimbo de horário) para não reescrever arquivos sem mudança
    corpo = json.dumps({k: v for k, v in payload.items() if k != "gerado_em"}, sort_keys=True, ensure_ascii=False)
    return hmac.new(senha.encode("utf-8"), corpo.encode("utf-8"), hashlib.sha256).hexdigest()


def gravar(payload, login, senha):
    """Grava o arquivo criptografado apenas se o conteúdo mudou. Retorna o nome do arquivo."""
    arq = DATA_DIR / nome_arquivo(login)
    h = assinatura(payload, senha)
    if arq.exists():
        try:
            if json.loads(arq.read_text(encoding="utf-8")).get("h") == h:
                return arq.name
        except ValueError:
            pass
    arq.write_text(json.dumps(dict(criptografar(payload, login, senha), h=h)), encoding="utf-8")
    return arq.name


def criptografar(payload, login, senha):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                     salt=salt_login(login), iterations=PBKDF2_ITER)
    chave = kdf.derive(senha.encode("utf-8"))
    iv = os.urandom(12)
    ct = AESGCM(chave).encrypt(iv, json.dumps(payload, ensure_ascii=False).encode("utf-8"), None)
    b64 = lambda x: base64.b64encode(x).decode()
    return {"v": 1, "iter": PBKDF2_ITER, "iv": b64(iv), "ct": b64(ct)}


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    _load_env()
    api_key = os.environ.get("REZDY_API_KEY") or os.environ.get("REZDY_KEY")
    senhas_raw = os.environ.get("PARCEIROS_SENHAS")
    if not api_key or not senhas_raw:
        sys.exit("Defina REZDY_API_KEY e PARCEIROS_SENHAS")
    senhas = {k.strip().lower(): v for k, v in json.loads(senhas_raw).items()}

    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    pct = float(config["comissao_pct"])
    data_inicio = config["data_inicio"]
    parceiros = {k.lower(): v for k, v in config["parceiros"].items()}

    # Pedidos sem cupom atribuídos a um parceiro (ex.: guias)
    pedido_para_parceiro = {n.upper(): login for login, p in parceiros.items() for n in p.get("pedidos", [])}
    reservas = extrair_reservas_cupom(buscar_reservas(api_key, data_inicio), data_inicio, frozenset(pedido_para_parceiro))
    print(f"{len(reservas)} reservas confirmadas com cupom desde {data_inicio}")

    gerado_em = datetime.now(timezone.utc).isoformat(timespec="seconds")
    cupom_para_parceiro = {c.upper(): login for login, p in parceiros.items() for c in p["cupons"]}

    DATA_DIR.mkdir(exist_ok=True)
    validos = set()

    for login, p in parceiros.items():
        if login not in senhas:
            print(f"  -- {login}: sem senha em PARCEIROS_SENHAS — não publicado")
            continue
        cupons = {c.upper() for c in p["cupons"]}
        pedidos = {n.upper() for n in p.get("pedidos", [])}
        payload = {
            "gerado_em": gerado_em, "comissao_pct": pct, "data_inicio": data_inicio,
            "admin": False, "parceiro": {"login": login, "nome": p["nome"], "tipo": p.get("tipo", "Parceiro"), "cupons": sorted(cupons)},
            "reservas": [r for r in reservas if r["cupom"] in cupons or r["n"].upper() in pedidos],
        }
        validos.add(gravar(payload, login, senhas[login]))
        print(f"  ok {login}: {len(payload['reservas'])} reservas")

    nomes = {login: p["nome"] for login, p in parceiros.items()}
    for admin in [a.lower() for a in config.get("admins", ["admin"])]:
        if admin not in senhas:
            continue
        payload = {
            "gerado_em": gerado_em, "comissao_pct": pct, "data_inicio": data_inicio,
            "admin": True, "parceiro": {"login": admin, "nome": "Vertical Rio", "cupons": []},
            "parceiros": [{"login": l, "nome": p["nome"], "tipo": p.get("tipo", "Parceiro"), "cupons": p["cupons"]} for l, p in parceiros.items()],
            "reservas": [dict(r, parceiro=nomes.get(pedido_para_parceiro.get(r["n"].upper()) or cupom_para_parceiro.get(r["cupom"]), "Sem parceiro"))
                         for r in reservas],
        }
        validos.add(gravar(payload, admin, senhas[admin]))
        print(f"  ok {admin} (admin): {len(reservas)} reservas")

    # Remove arquivos de parceiros que saíram da configuração
    for f in DATA_DIR.glob("*.json"):
        if f.name not in validos:
            f.unlink()


if __name__ == "__main__":
    main()
