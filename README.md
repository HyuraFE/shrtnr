# URL Shortener

A minimalist URL shortener built with Express.js, Turso (libSQL), and SQLite syntax, ready to deploy to Vercel.

## Features

- Shorten long URLs to compact links
- Custom readable alias / slug (e.g. `yourdomain.com/my-link`)
- Copy shortened URLs to clipboard with one click
- Track click counts & relative creation dates
- View and manage URL history (delete links)
- Minimalist, responsive design
- Cloud SQLite with Turso (compatible with Vercel serverless)

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** Turso / libSQL (`@libsql/client`)
- **ID Generator:** nanoid
- **Deployment Target:** Vercel

---

## Local Development

### 1. Installation

```bash
npm install
```

### 2. Environment Variables (Optional for local)

By default, the application falls back to a local SQLite file (`database.db`) if no Turso credentials are provided.

To connect to your Turso database locally, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in:
```env
TURSO_DATABASE_URL=libsql://your-database-name-username.turso.io
TURSO_AUTH_TOKEN=your-token-here
```

### 3. Run

```bash
npm start
# or development with auto-reload:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploy to Vercel

### Step 1: Create a Turso Database
1. Buka [turso.tech](https://turso.tech) dan buat akun gratis (bisa via GitHub).
2. Buat database baru (bisa lewat Turso CLI atau Web Dashboard Turso).
3. Salin:
   - **Database URL** (contoh: `libsql://nama-db-username.turso.io`)
   - **Auth Token** (klik *Generate Token*)

### Step 2: Push ke GitHub & Import ke Vercel
1. Push project ini ke repository GitHub kamu.
2. Buka [vercel.com](https://vercel.com) dan klik **Add New > Project**, lalu import repository ini.
3. Di bagian **Environment Variables** pada halaman konfigurasi Vercel, tambahkan:
   - `TURSO_DATABASE_URL` = *(URL dari Turso)*
   - `TURSO_AUTH_TOKEN` = *(Token dari Turso)*
4. Klik **Deploy**!

---

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/shorten` | Shorten a URL (supports optional `customCode`) |
| `GET` | `/:code` | Redirect to original URL |
| `GET` | `/api/urls` | List all shortened URLs |
| `GET` | `/api/stats/:code` | Get URL statistics |
| `DELETE` | `/api/urls/:code` | Delete a shortened URL |

## License

MIT
