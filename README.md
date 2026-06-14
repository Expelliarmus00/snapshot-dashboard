# Snapshot Media — Dashboard

Portail interne Snapshot Media : une page d'accueil derrière un **login par lien magique**
(magic-link email, calqué sur `snapshot-offres`) qui sert de **répertoire des applications**.
Première app intégrée : le **dashboard patrimonial immobilier** (Auboranges, FR).

Servi sur `dashboard.snapshotmedia.ch` — **Fastify + TypeScript + Prisma (SQLite)**, derrière Caddy,
déployé automatiquement à chaque push via un **runner GitHub Actions self-hosted** (même principe qu'afterglow).

---

## Architecture

```
dashboard.snapshotmedia.ch  →  Caddy (reverse_proxy)  →  127.0.0.1:4100 (systemd)
   /                  portail : grille d'apps (login requis)
   /apps/patrimoine/  dashboard patrimonial (Chart.js + SheetJS self-hosted)
   /api/auth/*        magic-link : login, callback, logout, me
   /api/apps          répertoire des apps (protégé)
   /api/patrimoine/*  state / config / historique 3a (protégé, append-only)
   /health            health check (public)
```

```
src/
├── server.ts            bootstrap Fastify (cors, cookie signé, rate-limit, static)
├── config.ts            config validée par zod (.env)
├── db/client.ts         Prisma client
├── middleware/auth.ts   garde de session (cookie signé → user)
├── services/auth.ts     magic-link + sessions (identique à snapshot-offres)
├── services/mailer.ts   envoi du lien via Resend
├── routes/auth.ts       /api/auth/*
├── routes/apps.ts       /api/apps
├── routes/patrimoine.ts /api/patrimoine/* (Prisma, append-only)
└── apps.ts              registre des apps (ajouter une carte ici)
prisma/schema.prisma     User (magic-link) + PatrimoineConfig + Historique
public/                  portail + apps + fonts + vendor (Chart.js, SheetJS)
deploy/                  unit systemd + snippet Caddy
.github/workflows/       déploiement CI/CD (runner self-hosted)
```

### Authentification (magic-link)

Même mécanisme que `snapshot-offres` : emails whitelistés (`ALLOWED_EMAILS`) →
`POST /api/auth/login` envoie un lien via Resend → `GET /api/auth/callback?token=…`
valide le token, pose un **cookie de session signé** (`snapshot_session`, httpOnly, 30 j)
et redirige vers le portail. Session stockée en base (Prisma).

---

## Développement local

Prérequis : **Node.js ≥ 20**.

```bash
npm install
cp .env.example .env        # renseigner SESSION_SECRET, RESEND_API_KEY, ALLOWED_EMAILS…
npx prisma db push          # crée la base SQLite + les tables
npm run dev                 # http://localhost:4100
```

> Sans clé Resend valide, le lien n'est pas envoyé par email mais le token est créé
> en base — pratique pour tester (récupérable via `npx prisma studio`).

---

## Déploiement sur le VPS (Hostinger + Caddy)

### 1. Runner GitHub Actions self-hosted (comme afterglow)

Dans le repo GitHub → **Settings → Actions → Runners → New self-hosted runner**, puis sur le VPS
suivre les commandes affichées. **Important** : ajouter le label `snapshot-dashboard`
(le workflow cible `runs-on: [self-hosted, snapshot-dashboard]`).

Autoriser le runner à redémarrer le service sans mot de passe :
```bash
# /etc/sudoers.d/snapshot-dashboard
<runner-user> ALL=(root) NOPASSWD: /usr/bin/systemctl restart snapshot-dashboard
```

### 2. Dossiers + .env (une fois)

```bash
sudo mkdir -p /opt/snapshot-dashboard /opt/snapshot-dashboard-data
sudo chown -R www-data:www-data /opt/snapshot-dashboard /opt/snapshot-dashboard-data

sudo -u www-data tee /opt/snapshot-dashboard/.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=4100
APP_URL=https://dashboard.snapshotmedia.ch
SESSION_SECRET=<openssl rand -hex 32>
ALLOWED_EMAILS=kevin.chinelli@gmail.com
DATABASE_URL=file:/opt/snapshot-dashboard-data/dashboard.db
RESEND_API_KEY=<clé Resend, identique à offres>
EMAIL_FROM=login@snapshotmedia.ch
EMAIL_FROM_NAME=Snapshot Media
EOF
```

> La base SQLite vit dans `/opt/snapshot-dashboard-data/` (hors du dossier synchronisé
> par le déploiement) pour ne jamais être écrasée par un `rsync --delete`.

### 3. Service systemd

```bash
sudo cp /opt/snapshot-dashboard/deploy/snapshot-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now snapshot-dashboard
```

### 4. Bloc Caddy

Ajouter le contenu de `deploy/Caddyfile.snippet` à `/etc/caddy/Caddyfile`, puis :
```bash
sudo systemctl reload caddy
```
Caddy obtient automatiquement le certificat TLS pour `dashboard.snapshotmedia.ch`
(le DNS doit pointer vers le VPS au préalable).

### 5. Premier déploiement

Le premier `git push` sur `main` déclenche le workflow : `npm ci` → `npm run build`
→ `prisma db push` → `systemctl restart` → health check. Les suivants sont automatiques.

---

## Ajouter une nouvelle app au portail

1. Déposer le front dans `public/apps/<slug>/`.
2. (Optionnel) ajouter des routes API protégées dans `src/routes/`.
3. Enregistrer la carte dans `src/apps.ts`.
4. Push → déploiement automatique.

---

## Sauvegarde

Toutes les données vivent dans `/opt/snapshot-dashboard-data/dashboard.db` (SQLite).
Sauvegarde par cron, par ex. chaque nuit :
```bash
0 3 * * * cp /opt/snapshot-dashboard-data/dashboard.db /opt/backups/dashboard-$(date +\%F).db
```
