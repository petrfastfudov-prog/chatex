const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

// 1. Создаем HTTP-сервер, который отдает файл index.html при входе на сайт
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Ошибка загрузки интерфейса. Убедитесь, что файл index.html лежит рядом с server.js.');
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

// 2. Привязываем наш WebSocket-сервер к этому же HTTP-серверу
const wss = new WebSocketServer({ server });

let waitingUser = null;

function broadcastOnlineCount() {
    const count = wss.clients.size;
    const payload = JSON.stringify({ type: 'online_count', count: count });
    
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(payload);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('Пользователь подключился');
    broadcastOnlineCount();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'find_peer') {
                if (ws.peer) {
                    if (ws.peer.readyState === 1) {
                        ws.peer.send(JSON.stringify({ type: 'peer_disconnected' }));
                    }
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
        if (waitingUser === ws) {
            waitingUser = null;
        }
        if (ws.peer) {
            if (ws.peer.readyState === 1) {
                ws.peer.send(JSON.stringify({ type: 'peer_disconnected' }));
            }
            ws.peer.peer = null;
            ws.peer = null;
        }
        broadcastOnlineCount();
    });
});

// 3. Запускаем объединенный сервер
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
