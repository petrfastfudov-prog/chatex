const { WebSocketServer } = require('ws');

// Создаем WebSocket-сервер на порту 8080
const wss = new WebSocketServer({ port: 8080 });

let waitingUser = null; // Пользователь, ожидающий собеседника

wss.on('connection', (ws) => {
    console.log('Пользователь подключился');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Поиск собеседника
            if (data.type === 'find_peer') {
                // Если пользователь уже был с кем-то в паре, разрываем связь
                if (ws.peer) {
                    ws.peer.send(JSON.stringify({ type: 'peer_disconnected' }));
                    ws.peer.peer = null;
                    ws.peer = null;
                }

                if (waitingUser && waitingUser !== ws && waitingUser.readyState === 1) {
                    // Нашли пару! Связываем двух пользователей друг с другом
                    ws.peer = waitingUser;
                    waitingUser.peer = ws;

                    // Отправляем сигнал обоим
                    ws.send(JSON.stringify({ type: 'peer_found', initiator: true }));
                    waitingUser.send(JSON.stringify({ type: 'peer_found', initiator: false }));

                    console.log('Пара успешно сформирована!');
                    waitingUser = null;
                } else {
                    // Если никого нет в очереди, ставим пользователя в ожидание
                    waitingUser = ws;
                    console.log('Пользователь добавлен в очередь');
                }
            }

            // 2. Пересылка WebRTC сигналов (offer, answer, candidate) и сообщений чата
            if (['offer', 'answer', 'candidate', 'chat_message'].includes(data.type)) {
                if (ws.peer && ws.peer.readyState === 1) {
                    ws.peer.send(JSON.stringify(data));
                }
            }
        } catch (err) {
            console.error('Ошибка обработки данных:', err);
        }
    });

    // 3. Обработка отключения
    ws.on('close', () => {
        console.log('Пользователь отключился');
        if (waitingUser === ws) {
            waitingUser = null;
        }
        if (ws.peer) {
            ws.peer.send(JSON.stringify({ type: 'peer_disconnected' }));
            ws.peer.peer = null;
            ws.peer = null;
        }
    });
});

console.log('🚀 Сигнальный сервер запущен на ws://localhost:8080');