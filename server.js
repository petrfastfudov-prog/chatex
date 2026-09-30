const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Создаем HTTP-сервер, который отдает index.html при открытии сайта
const server = http.createServer((req, res) => {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Ошибка сервера: файл index.html не найден.');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server });

let waitingPeer = null;
let onlineCount = 0;

function broadcastOnlineCount() {
    const msg = JSON.stringify({ type: 'online_count', count: onlineCount });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

function disconnectPeers(ws) {
    if (ws === waitingPeer) {
        waitingPeer = null;
    }
    if (ws.peer) {
        if (ws.peer.readyState === WebSocket.OPEN) {
            ws.peer.send(JSON.stringify({ type: 'peer_disconnected' }));
        }
        ws.peer.peer = null;
        ws.peer = null;
    }
}

wss.on('connection', (ws) => {
    onlineCount++;
    broadcastOnlineCount();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'find_peer':
                    disconnectPeers(ws);
                    if (waitingPeer && waitingPeer !== ws && waitingPeer.readyState === WebSocket.OPEN) {
                        ws.peer = waitingPeer;
                        waitingPeer.peer = ws;

                        ws.send(JSON.stringify({ type: 'peer_found', initiator: false }));
                        waitingPeer.send(JSON.stringify({ type: 'peer_found', initiator: true }));

                        waitingPeer = null;
                    } else {
                        waitingPeer = ws;
                    }
                    break;

                case 'stop_search':
                    disconnectPeers(ws);
                    break;

                case 'offer':
                case 'answer':
                case 'candidate':
                case 'chat_message':
                    if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
                        ws.peer.send(JSON.stringify(data));
                    }
                    break;

                default:
                    break;
            }
        } catch (err) {
            console.error('[Server] Ошибка обработки сообщения:', err);
        }
    });

    ws.on('close', () => {
        onlineCount--;
        disconnectPeers(ws);
        broadcastOnlineCount();
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`[Server] Запущено на порту ${PORT}`);
});
