const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const { customAlphabet } = require('nanoid');

// Nanoid with lowercase + digits, omitting ambiguous characters (l, 1, 0, o)
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
const generateShortCode = customAlphabet(ALPHABET, 7);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database
const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    clicks INTEGER DEFAULT 0
  )
`);

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

  // Add https protocol if missing
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
app.post('/api/shorten', (req, res) => {
  const { url, customCode } = req.body || {};
  const validUrl = normalizeUrl(url);

  if (!validUrl) {
    return res.status(400).json({ error: 'Please enter a valid URL' });
  }

  let shortCode;
  const checkStmt = db.prepare('SELECT id FROM urls WHERE short_code = ?');

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
    if (checkStmt.get(shortCode)) {
      return res.status(409).json({ error: 'This alias is already taken, please choose another' });
    }
  } else {
    // Auto-generate short code
    let attempts = 0;
    while (attempts < 5) {
      shortCode = generateShortCode();
      if (!checkStmt.get(shortCode)) break;
      attempts++;
    }

    if (attempts >= 5) {
      return res.status(500).json({ error: 'Could not generate unique short code, please try again' });
    }
  }

  try {
    const insertStmt = db.prepare('INSERT INTO urls (original_url, short_code) VALUES (?, ?)');
    insertStmt.run(validUrl, shortCode);

    const baseUrl = getBaseUrl(req);
    const shortUrl = `${baseUrl}/${shortCode}`;

    return res.status(201).json({
      shortUrl,
      shortCode,
      originalUrl: validUrl
    });
  } catch (err) {
    console.error('Error inserting URL:', err);
    return res.status(500).json({ error: 'Database error occurred' });
  }
});

// GET /api/urls - list all URLs ordered by created_at DESC
app.get('/api/urls', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, original_url, short_code, created_at, clicks
      FROM urls
      ORDER BY created_at DESC, id DESC
    `).all();

    const baseUrl = getBaseUrl(req);
    const urls = rows.map(item => ({
      id: item.id,
      original_url: item.original_url,
      short_code: item.short_code,
      created_at: item.created_at,
      clicks: item.clicks,
      short_url: `${baseUrl}/${item.short_code}`
    }));

    return res.json(urls);
  } catch (err) {
    console.error('Error retrieving URLs:', err);
    return res.status(500).json({ error: 'Failed to retrieve URLs' });
  }
});

// GET /api/stats/:code - stats for a specific short code
app.get('/api/stats/:code', (req, res) => {
  const { code } = req.params;

  try {
    const row = db.prepare(`
      SELECT id, original_url, short_code, created_at, clicks
      FROM urls
      WHERE short_code = ?
    `).get(code);

    if (!row) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    const baseUrl = getBaseUrl(req);
    return res.json({
      original_url: row.original_url,
      short_code: row.short_code,
      created_at: row.created_at,
      clicks: row.clicks,
      short_url: `${baseUrl}/${row.short_code}`
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    return res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// DELETE /api/urls/:code - delete a shortened URL
app.delete('/api/urls/:code', (req, res) => {
  const { code } = req.params;

  try {
    const deleteStmt = db.prepare('DELETE FROM urls WHERE short_code = ?');
    const result = deleteStmt.run(code);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Short URL not found' });
    }

    return res.json({ success: true, message: 'URL deleted successfully' });
  } catch (err) {
    console.error('Error deleting URL:', err);
    return res.status(500).json({ error: 'Failed to delete URL' });
  }
});

// GET /:code - Redirect to original URL, or back to / with error if not found
app.get('/:code', (req, res) => {
  const { code } = req.params;

  // Skip favicon or special static requests
  if (!code || code === 'favicon.ico' || code === 'robots.txt') {
    return res.status(404).end();
  }

  try {
    const row = db.prepare('SELECT original_url FROM urls WHERE short_code = ?').get(code);

    if (!row) {
      return res.redirect('/?error=not_found');
    }

    // Increment click count
    db.prepare('UPDATE urls SET clicks = clicks + 1 WHERE short_code = ?').run(code);

    // 302 redirect to original URL
    return res.redirect(302, row.original_url);
  } catch (err) {
    console.error('Error handling redirect:', err);
    return res.redirect('/?error=server_error');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
