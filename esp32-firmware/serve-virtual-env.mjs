import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 8085;
const baseDir = path.resolve('esp32-firmware');

const server = http.createServer((req, res) => {
  let filePath = path.join(baseDir, req.url === '/' ? 'virtual_hardware_monitor.html' : req.url);
  
  const extname = path.extname(filePath);
  let contentType = 'text/html';
  if (extname === '.js') contentType = 'text/javascript';
  if (extname === '.css') contentType = 'text/css';
  if (extname === '.json') contentType = 'application/json';
  if (extname === '.png') contentType = 'image/png';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Virtual Hardware Monitor running at http://localhost:${PORT}/virtual_hardware_monitor.html`);
});
