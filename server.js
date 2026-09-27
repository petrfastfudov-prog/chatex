const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

// HTTP-сервер для отдачи index.html
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Ошибка загрузки index.html');
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

            // Поиск собеседника
            if (data.type === 'find_peer') {
                // Если был в паре — разрываем
                if (ws.peer) {
                    if (ws.peer.readyState === 1) {
                        ws.peer.send(JSON.stringify({ type: 'peer_disconnected' }));
                    }
                    ws.peer.peer = null;
                    ws.peer = null;
                }

                // Если уже висел в очереди — сбрасываем старую очередь
                if (waitingUser === ws) {
                    waitingUser = null;
                }

                if (waitingUser && waitingUser !== ws && waitingUser.readyState === 1) {
                    ws.peer = waitingUser;
                    waitingUser.peer = ws;

                    ws.send(JSON.stringify({ type: 'peer_found', initiator: true }));
                    waitingUser.send(JSON.stringify({ type: 'peer_found', initiator: false }));

                    console.log('Пара успешно сформирована!');
                    waitingUser = null;
                } else {
                    waitingUser = ws;
                    console.log('Пользователь добавлен в очередь');
                }
            }

            // Остановка поиска
            if (data.type === 'stop_search') {
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
            }

            // Пересылка WebRTC сообщений и чата
            if (['offer', 'answer', 'candidate', 'chat_message'].includes(data.type)) {
                if (ws.peer && ws.peer.readyState === 1) {
                    ws.peer.send(JSON.stringify(data));
                }
            }
        } catch (err) {
            console.error('Ошибка обработки:', err);
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

server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
