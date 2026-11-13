// Minimal static server for the spike pages: node serve.js [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const root = import.meta.dirname;
createServer(async (req, res) => {
  try {
    const p = join(root, normalize(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root)) throw 0;
    const body = await readFile(p); // read first: headers can only be sent once
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'text/plain' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(+process.argv[2] || 8090, '127.0.0.1', () => console.log('http://127.0.0.1:' + (+process.argv[2] || 8090)));
