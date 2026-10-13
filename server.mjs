import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3050;
const DATA_FILE = path.join(__dirname, 'data', 'courses.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Load environment variables from .env if present
try {
  if (fs.existsSync(path.join(__dirname, '.env'))) {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    envContent.split('\n').forEach(line => {
      const [k, v] = line.split('=');
      if (k && v && !process.env[k.trim()]) process.env[k.trim()] = v.trim();
    });
  }
} catch (e) {}

const DEFAULT_OPENAI_KEY = process.env.OPENAI_API_KEY || '';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function loadCourses() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Kunne ikke lese courses.json:', err);
  }
  return [];
}

function saveCourses(courses) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(courses, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Kunne ikke lagre courses.json:', err);
    return false;
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. GET ALL COURSES
  if (url.pathname === '/api/courses' && req.method === 'GET') {
    const courses = loadCourses();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(courses));
    return;
  }

  // 2. CREATE / UPDATE COURSE
  if (url.pathname === '/api/courses' && req.method === 'POST') {
    try {
      const course = await parseJsonBody(req);
      const courses = loadCourses();
      
      const idx = courses.findIndex(c => c.id === course.id);
      if (idx !== -1) {
        courses[idx] = { ...courses[idx], ...course, updatedAt: new Date().toISOString() };
      } else {
        if (!course.id) course.id = Date.now();
        courses.unshift(course);
      }

      saveCourses(courses);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, course }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ugyldig kursdata' }));
    }
    return;
  }

  // 3. DELETE COURSE
  if (url.pathname.startsWith('/api/courses/') && req.method === 'DELETE') {
    const id = parseInt(url.pathname.split('/')[3], 10);
    let courses = loadCourses();
    courses = courses.filter(c => c.id !== id);
    saveCourses(courses);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, id }));
    return;
  }

  // 4. IMAGE UPLOAD
  if (url.pathname === '/api/upload' && req.method === 'POST') {
    try {
      const { filename, base64Data } = await parseJsonBody(req);
      if (!base64Data) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Mangler bilde-data' }));
        return;
      }

      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const ext = path.extname(filename || 'image.jpg') || '.jpg';
      const safeName = `img-${Date.now()}-${Math.floor(Math.random()*1000)}${ext}`;
      const filePath = path.join(UPLOAD_DIR, safeName);

      fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));

      const publicUrl = `/uploads/${safeName}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, url: publicUrl, name: safeName }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Feil ved lagring av bilde' }));
    }
    return;
  }

  // 5. OPENAI AI-GENERATOR (kurs, leksjoner og caser)
  if ((url.pathname === '/api/generate' || url.pathname === '/api/ai/generate') && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.apiKey) body.apiKey = DEFAULT_OPENAI_KEY;
      const fakeReq = { method: 'POST', body };
      const fakeRes = {
        setHeader: () => {},
        status: (code) => ({
          json: (data) => {
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          },
          end: () => res.end()
        })
      };
      const { default: handler } = await import('./api/generate.js');
      await handler(fakeReq, fakeRes);
    } catch (err) {
      console.error('Genereringsfeil:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 6. EXPORT BACKUP
  if (url.pathname === '/api/export' && req.method === 'GET') {
    const courses = loadCourses();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="himmelblaa-kurs-backup-${new Date().toISOString().split('T')[0]}.json"`
    });
    res.end(JSON.stringify(courses, null, 2));
    return;
  }

  // 7. IMPORT BACKUP
  if (url.pathname === '/api/import' && req.method === 'POST') {
    try {
      const imported = await parseJsonBody(req);
      if (Array.isArray(imported)) {
        saveCourses(imported);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: imported.length }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ugyldig format' }));
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Feil ved import' }));
    }
    return;
  }

  // STATIC ASSETS
  let filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Fil ikke funnet');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🎓 Himmelblå Skolen Studio kjører på: http://localhost:${PORT}`);
});
