# Parceiros Vertical

Portal para parceiros da Vertical Rio acompanharem as reservas **confirmadas no Rezdy** feitas com o seu cupom de desconto: número de reservas, receita bruta e comissão.

**Acesso:** https://performance-sketch.github.io/ParceirosVertical/

## Como funciona

- A cada 15 minutos o GitHub Action `update.yml` roda `scripts/build_data.py`, que busca as reservas no Rezdy (somente `CONFIRMED` com cupom, sem dados pessoais de clientes).
- Para cada parceiro é gerado um arquivo em `data/` **criptografado com a senha dele** (PBKDF2-SHA256 + AES-256-GCM). O nome do arquivo é um hash do login.
- O `index.html` (GitHub Pages) baixa o arquivo do login informado e o descriptografa no navegador. Senha errada = não abre.
- O login `admin` vê todos os parceiros e cupons.

## Configuração

`config.json`
- `comissao_pct` — percentual de comissão sobre a receita bruta (único para todos)
- `data_inicio` — reservas criadas a partir desta data
- `admins` — logins com visão de todos os parceiros

Ciclo de análise: dia 26 do mês anterior ao dia 25 do mês (ex.: Setembro = 26/08–25/09).
- `parceiros` — `login → { nome, tipo, cupons[], pedidos[] }` (`pedidos`: números de pedido Rezdy sem cupom atribuídos ao parceiro, ex.: guias)

Secrets do repositório (Settings → Secrets → Actions)
- `REZDY_API_KEY`
- `PARCEIROS_SENHAS` — JSON `{"admin": "...", "vazaonde": "...", ...}`

Parceiro sem senha em `PARCEIROS_SENHAS` não é publicado.

### Adicionar um parceiro
1. Adicione em `config.json` → `parceiros`.
2. Adicione a senha no secret `PARCEIROS_SENHAS`.
3. Rode o workflow manualmente (Actions → Atualizar dados dos parceiros → Run workflow).

## Rodar localmente

```bash
pip install requests cryptography
# .env com REZDY_API_KEY=... e PARCEIROS_SENHAS={"admin":"..."}
python scripts/build_data.py
python -m http.server 8000
```
