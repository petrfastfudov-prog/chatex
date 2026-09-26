const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// Render автоматически передает порт через process.env.PORT
const PORT = process.env.PORT || 8080;

// 1. HTTP-сервер для отдачи index.html
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Ошибка загрузки сайта');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// 2. Подключаем WebSocket к HTTP-серверу
const wss = new WebSocketServer({ server });
let waitingUser = null;

wss.on('connection', (ws) => {
    console.log('Пользователь подключился');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'find_peer') {
                if (ws.peer) {
                    ws.peer.send(JSON.stringify({ type: 'peer_disconnected' }));
                    ws.peer.peer = null;
                    ws.peer = null;
                }

                if (waitingUser && waitingUser !== ws && waitingUser.readyState === 1) {
                    ws.peer = waitingUser;
                    waitingUser.peer = ws;

                    ws.send(JSON.stringify({ type: 'peer_found', initiator: true }));
                    waitingUser.send(JSON.stringify({ type: 'peer_found', initiator: false }));

                    console.log('Пара сформирована!');
                    waitingUser = null;
                } else {
                    waitingUser = ws;
                    console.log('Пользователь в очереди');
                }
            }

            if (['offer', 'answer', 'candidate', 'chat_message'].includes(data.type)) {
                if (ws.peer && ws.peer.readyState === 1) {
                    ws.peer.send(JSON.stringify(data));
                }
            }
        } catch (err) {
            console.error('Ошибка:', err);
        }
    });

    ws.on('close', () => {
        console.log('Пользователь отключился');
        if (waitingUser === ws) waitingUser = null;
        if (ws.peer) {
            ws.peer.send(JSON.stringify({ type: 'peer_disconnected' }));
            ws.peer.peer = null;
            ws.peer = null;
        }
    });
});

// Запуск сервера
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
