# Parceiros Vertical

Portal para parceiros da Vertical Rio acompanharem as reservas **confirmadas no Rezdy** feitas com o seu cupom de desconto: número de reservas, receita bruta e comissão.

**Acesso:** https://performance-sketch.github.io/ParceirosVertical/

## Como funciona

- A cada 15 minutos o GitHub Action `update.yml` roda `scripts/build_data.py`, que busca as reservas no Rezdy (somente `CONFIRMED` com cupom, sem dados pessoais de clientes).
- Para cada parceiro é gerado um arquivo em `data/` **criptografado com a senha dele** (PBKDF2-SHA256 + AES-256-GCM). O nome do arquivo é um hash do login.
- O `index.html` (GitHub Pages) baixa o arquivo do login informado e o descriptografa no navegador. Senha errada = não abre.
- O login `admin` vê todos os parceiros e cupons.

## Biblioteca de Posts dos Creators — Instagram (aba Conteúdos)

- O creator cola o link de um Reel/post/carrossel em **Adicionar publicação**. O envio é assinado no navegador com a chave do login dele.
- Fluxo: portal → webhook do Make (cenário *Parceiros Vertical — Receber post*) → GitHub `repository_dispatch` → `receber-post.yml` grava em `instagram/inbox/` → `update.yml` roda `scripts/instagram_sync.py`, que confere a assinatura e coleta as métricas.
- `scripts/instagram_post_provider.py` (instagramPostProvider) lê **somente a página pública** do post, sem login: @, data, legenda, capa, curtidas e comentários. Visualizações, compartilhamentos e reposts não são públicos e ficam como "—". Bloqueio do Instagram vira status "Erro de coleta" — sem contorno.
- Coleta diária (semanal para posts com mais de 60 dias); cada coleta vira um ponto do histórico em `instagram/posts.json`. Capas ficam em `instagram/thumbs/`.
- O cenário do Make guarda um token do GitHub (fine-grained, só este repositório, permissão *Contents: read and write*).

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
- `META_IG_TOKEN` — token do usuário de sistema da Meta (mesmo `META_ACCESS_TOKEN` do MetaOrganico). Usado na biblioteca de posts para puxar, via API oficial (Business Discovery pela conta @vertical.rio), visualizações, curtidas/comentários exatos e seguidores. Sem ele, ou para perfis pessoais, valem os números da página pública do post.

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

## Biblioteca de posts (Instagram)

- O creator cola só o link do post. A coleta lê a página pública para descobrir o @ do dono e consulta a API da Meta (`scripts/instagram_post_provider.py`).
- Envio pelo portal → Make → `receber-post.yml`, que coleta **só o post novo** (`instagram_sync.py --somente-novos`). Os demais posts são atualizados pelo `update.yml` (recentes 1×/dia, antigos 1×/semana).
- Se o cenário do Make responder com o JSON da API da Meta, o portal mostra uma prévia das métricas na hora (`previaDe` em `conteudos.js`).
