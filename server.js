require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@libsql/client');
const { customAlphabet } = require('nanoid');

// Nanoid with lowercase + digits, omitting ambiguous characters (l, 1, 0, o)
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
const generateShortCode = customAlphabet(ALPHABET, 7);

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Turso / libSQL Client
let tursoUrl = process.env.TURSO_DATABASE_URL;
let tursoToken = process.env.TURSO_AUTH_TOKEN;

// In Vercel serverless environment, local filesystem is read-only.
// If Turso env vars are missing on Vercel, we must not fallback to file:database.db.
const isVercel = Boolean(process.env.VERCEL);

let db = null;
let dbConfigError = null;

if (!tursoUrl && isVercel) {
  dbConfigError = 'Missing TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel Environment Variables. Please add them in project settings and redeploy.';
} else {
  try {
    // Normalize URL if protocol is missing
    let normalizedUrl = tursoUrl || 'file:database.db';
    if (tursoUrl && !/^https?:\/\/|^libsql:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `libsql://${normalizedUrl}`;
    }

    db = createClient({
      url: normalizedUrl,
      authToken: tursoToken
    });
  } catch (err) {
    dbConfigError = `Failed to initialize database client: ${err.message}`;
  }
}

// Ensure database table exists
let dbInitialized = false;
async function ensureDb() {
  if (dbConfigError) {
    throw new Error(dbConfigError);
  }
  if (!db) {
    throw new Error('Database client is not available.');
  }
  if (dbInitialized) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_url TEXT NOT NULL,
      short_code TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      clicks INTEGER DEFAULT 0
    )
  `);
  dbInitialized = true;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to construct short URL
function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
}

// Helper to validate and normalize URL
function normalizeUrl(inputUrl) {
  if (typeof inputUrl !== 'string') return null;
  let trimmed = inputUrl.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

// POST /api/shorten
app.post('/api/shorten', async (req, res) => {
  try {
    await ensureDb();

    const { url, customCode } = req.body || {};
    const validUrl = normalizeUrl(url);

    if (!validUrl) {
      return res.status(400).json({ error: 'Please enter a valid URL' });
    }

    let shortCode;

    if (customCode && customCode.trim()) {
      // Validate custom alias
      shortCode = customCode.trim().toLowerCase();

      if (shortCode.length < 3 || shortCode.length > 30) {
        return res.status(400).json({ error: 'Custom alias must be 3–30 characters' });
      }

      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(shortCode) && shortCode.length > 2) {
        return res.status(400).json({ error: 'Only lowercase letters, numbers, and hyphens allowed (cannot start or end with hyphen)' });
      }

      // Reserved words
      const reserved = ['api', 'admin', 'static', 'public', 'favicon.ico', 'robots.txt'];
      if (reserved.includes(shortCode)) {
        return res.status(400).json({ error: 'This alias is reserved, please choose another' });
      }

      // Check uniqueness
      const existing = await db.execute({
        sql: 'SELECT id FROM urls WHERE short_code = ?',
        args: [shortCode]
      });
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'This alias is already taken, please choose another' });
      }
    } else {
      // Auto-generate short code
      let attempts = 0;
      while (attempts < 5) {
        shortCode = generateShortCode();
        const existing = await db.execute({
          sql: 'SELECT id FROM urls WHERE short_code = ?',
          args: [shortCode]
        });
        if (existing.rows.length === 0) break;
        attempts++;
      }

      if (attempts >= 5) {
        return res.status(500).json({ error: 'Could not generate unique short code, please try again' });
      }
    }

    await db.execute({
      sql: 'INSERT INTO urls (original_url, short_code) VALUES (?, ?)',
      args: [validUrl, shortCode]
    });

    const baseUrl = getBaseUrl(req);
    const shortUrl = `${baseUrl}/${shortCode}`;

    return res.status(201).json({
      shortUrl,
      shortCode,
      originalUrl: validUrl
    });
  } catch (err) {
    console.error('Error in /api/shorten:', err);
    return res.status(500).json({ 
      error: err.message || 'Database error occurred' 
    });
  }
});

// GET /api/urls - list all URLs ordered by created_at DESC
app.get('/api/urls', async (req, res) => {
  try {
    await ensureDb();

    const result = await db.execute(`
      SELECT id, original_url, short_code, created_at, clicks
      FROM urls
      ORDER BY created_at DESC, id DESC
    `);

    const baseUrl = getBaseUrl(req);
    const urls = result.rows.map(item => ({
      id: item.id,
      original_url: item.original_url,
      short_code: item.short_code,
      created_at: item.created_at,
      clicks: item.clicks,
      short_url: `${baseUrl}/${item.short_code}`
    }));

    return res.json(urls);
  } catch (err) {
    console.error('Error in /api/urls:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to retrieve URLs' 
    });
  }
});

// GET /api/stats/:code - stats for a specific short code
app.get('/api/stats/:code', async (req, res) => {
  const { code } = req.params;

  try {
    await ensureDb();

    const result = await db.execute({
      sql: `
        SELECT id, original_url, short_code, created_at, clicks
        FROM urls
        WHERE short_code = ?
      `,
      args: [code]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    const row = result.rows[0];
    const baseUrl = getBaseUrl(req);
    return res.json({
      original_url: row.original_url,
      short_code: row.short_code,
      created_at: row.created_at,
      clicks: row.clicks,
      short_url: `${baseUrl}/${row.short_code}`
    });
  } catch (err) {
    console.error('Error in /api/stats:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to fetch statistics' 
    });
  }
});

// DELETE /api/urls/:code - delete a shortened URL
app.delete('/api/urls/:code', async (req, res) => {
  const { code } = req.params;

  try {
    await ensureDb();

    const result = await db.execute({
      sql: 'DELETE FROM urls WHERE short_code = ?',
      args: [code]
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    return res.json({ success: true, message: 'URL deleted successfully' });
  } catch (err) {
    console.error('Error in /api/urls delete:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to delete URL' 
    });
  }
});

// GET /:code - Redirect to original URL, or back to / with error if not found
app.get('/:code', async (req, res) => {
  const { code } = req.params;

  // Skip favicon or special static requests
  if (!code || code === 'favicon.ico' || code === 'robots.txt') {
    return res.status(404).end();
  }

  try {
    await ensureDb();

    const result = await db.execute({
      sql: 'SELECT original_url FROM urls WHERE short_code = ?',
      args: [code]
    });

    if (result.rows.length === 0) {
      return res.redirect('/?error=not_found');
    }

    const row = result.rows[0];

    // Increment click count (non-blocking)
    db.execute({
      sql: 'UPDATE urls SET clicks = clicks + 1 WHERE short_code = ?',
      args: [code]
    }).catch(e => console.error('Error updating clicks:', e));

    // 302 redirect to original URL
    return res.redirect(302, row.original_url);
  } catch (err) {
    console.error('Error handling redirect:', err);
    return res.redirect('/?error=server_error');
  }
});

// Start server if run locally directly
if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
