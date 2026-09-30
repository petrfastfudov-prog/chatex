const WebSocket = require('ws');
const http = require('http');

// Создаем базовый HTTP-сервер для health-чеков (полезно для reverse proxy)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Chatex Signaling Server is running.');
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
        waitingPeer = null; // Убираем из очереди поиска
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
                    disconnectPeers(ws); // На всякий случай очищаем старые связи
                    if (waitingPeer && waitingPeer !== ws && waitingPeer.readyState === WebSocket.OPEN) {
                        // Соединяем двух пользователей
                        ws.peer = waitingPeer;
                        waitingPeer.peer = ws;

                        // Кто-то один должен быть инициатором (создавать Offer)
                        ws.send(JSON.stringify({ type: 'peer_found', initiator: false }));
                        waitingPeer.send(JSON.stringify({ type: 'peer_found', initiator: true }));

                        waitingPeer = null; // Очищаем очередь
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
                    // Пересылаем данные только собеседнику
                    if (ws.peer && ws.peer.readyState === WebSocket.OPEN) {
                        ws.peer.send(JSON.stringify(data));
                    } else {
                        console.error(`[Server] Ошибка пересылки ${data.type}: собеседник не найден или отключен.`);
                    }
                    break;

                default:
                    console.warn('[Server] Неизвестный тип сообщения:', data.type);
            }
        } catch (err) {
            console.error('[Server] Ошибка обработки сообщения (неверный JSON):', err);
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
    console.log(`[Server] Signaling server listening on port ${PORT}`);
});
