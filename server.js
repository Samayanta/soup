const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;

// Serve static files like the HTML page and PDF
const server = http.createServer((req, res) => {
    const reqUrl = url.parse(req.url, true);
    let filePath = '.' + reqUrl.pathname;

    if (filePath == './') filePath = './index.html'; // Default to index.html

    const extname = path.extname(filePath);

    let contentType = 'text/html';
    if (extname == '.js') contentType = 'application/javascript';
    if (extname == '.pdf') contentType = 'application/pdf';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    execSync('node start.js'); // This runs your start.js automatically when the server starts
});
