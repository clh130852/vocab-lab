/* 本地静态服务器：方便在电脑和同一 Wi-Fi 下的手机/iPad 上使用
 * 用法： node tools/serve.js [端口]      默认 5180
 */
var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');

var root = path.resolve(__dirname, '..');
var port = Number(process.argv[2]) || 5180;

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

var server = http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  var filePath = path.join(root, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (filePath.indexOf(root) !== 0) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

function addresses() {
  var out = [];
  var ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    (ifaces[name] || []).forEach(function (info) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    });
  });
  return out;
}

server.listen(port, '0.0.0.0', function () {
  console.log('Vocab Lab 已启动 / running:');
  console.log('  本机:  http://127.0.0.1:' + port + '/index.html');
  addresses().forEach(function (ip) {
    console.log('  同网段设备（iPad / 手机）: http://' + ip + ':' + port + '/index.html');
  });
  console.log('  停止服务：在本窗口按 Ctrl+C');
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + port + ' 已被占用，换个端口试试：node tools/serve.js ' + (port + 1));
  } else {
    console.error(err);
  }
  process.exit(1);
});
