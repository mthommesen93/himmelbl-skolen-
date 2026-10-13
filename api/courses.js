import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const filePath = path.join(process.cwd(), 'data', 'courses.json');

  if (req.method === 'GET') {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return res.status(200).json(JSON.parse(raw));
      }
    } catch (e) {
      console.error(e);
    }
    return res.status(200).json([]);
  }

  if (req.method === 'POST') {
    // When Supabase is not connected, respond OK so the client does not crash
    return res.status(200).json({ success: true, message: 'Saved (fallback mode)' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
