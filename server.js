const { WebSocketServer } = require('ws');

// Использование порт из окружения (для Render/Heroku) или 8080 по умолчанию
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

let waitingUser = null;

// Рассылка количества подключенных клиентов в реальном времени
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
    
    // Обновляем счётчик онлайн при входе нового пользователя
    broadcastOnlineCount();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Поиск собеседника
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

                    console.log('Пара успешно сформирована!');
                    waitingUser = null;
                } else {
                    waitingUser = ws;
                    console.log('Пользователь добавлен в очередь');
                }
            }

            // 2. Пересылка WebRTC сигналов и текстовых сообщений
            if (['offer', 'answer', 'candidate', 'chat_message'].includes(data.type)) {
                if (ws.peer && ws.peer.readyState === 1) {
                    ws.peer.send(JSON.stringify(data));
                }
            }
        } catch (err) {
            console.error('Ошибка обработки сообщения:', err);
        }
    });

    // 3. Отключение пользователя
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
        // Обновляем счётчик онлайн при выходе
        broadcastOnlineCount();
    });
});

console.log(`🚀 Сигнальный сервер запущен на порту ${PORT}`);
