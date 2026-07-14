const dgram = require('dgram');
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const os = require('os');

// Конфигурация
const CONFIG = {
    udpPort: 9000,
    tcpPort: 1000,
    broadcastAddr: '255.255.255.255',
    httpPort: 8080,
    wsPort: 8081,
    timeout: 5000,
    reconnectAttempts: 3,
    reconnectDelay: 2000
};

// Пути
const PATHS = {
    pages: path.join(__dirname, 'pages'),
    settings: path.join(__dirname, 'settings'),
    api: path.join(__dirname, 'api'),
    public: path.join(__dirname, 'public')
};

// Создание необходимых папок
Object.values(PATHS).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Состояние приложения
const state = {
    converters: new Map(),
    activeConnections: new Map(),
    settings: {
        udpSearchEnabled: true,
        logEnabled: false,
        showBytes: false,
        selectedConverters: {}
    },
    apiModules: {},
    wsClients: new Map()
};

let clientIdCounter = 0;

// Загрузка настроек
function loadSettings() {
    const settingsFile = path.join(PATHS.settings, 'app_settings.json');
    if (fs.existsSync(settingsFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            state.settings = { ...state.settings, ...data };
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
}

// Сохранение настроек
function saveSettings() {
    const settingsFile = path.join(PATHS.settings, 'app_settings.json');
    try {
        fs.writeFileSync(settingsFile, JSON.stringify(state.settings, null, 2));
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

// Загрузка конвертеров
function loadConverters() {
    const convertersFile = path.join(PATHS.settings, 'converters.json');
    if (fs.existsSync(convertersFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(convertersFile, 'utf8'));
            data.forEach(conv => {
                state.converters.set(conv.ip, conv);
            });
        } catch (e) {
            console.error('Error loading converters:', e);
        }
    }
}

// Сохранение конвертеров
function saveConverters() {
    const convertersFile = path.join(PATHS.settings, 'converters.json');
    try {
        const data = Array.from(state.converters.values());
        fs.writeFileSync(convertersFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving converters:', e);
    }
}

// ============== Функции поиска сетевых интерфейсов ==============
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    
    return ips;
}

// ============== UDP Сервер для поиска ==============
const udpServer = dgram.createSocket('udp4');

udpServer.bind(CONFIG.udpPort, () => {
    udpServer.setBroadcast(true);
    console.log(`UDP поисковый сервер запущен на порту ${CONFIG.udpPort}`);
});

let udpInterval = null;

function startUdpSearch() {
    if (udpInterval) clearInterval(udpInterval);
    udpInterval = setInterval(() => {
        if (state.settings.udpSearchEnabled) {
            const message = Buffer.from("SEEK Z397IP");
            udpServer.send(message, 0, message.length, CONFIG.udpPort, CONFIG.broadcastAddr, (err) => {
                if (err) {
                    console.error('UDP send error:', err);
                }
            });
        }
    }, 3000);
}

function stopUdpSearch() {
    if (udpInterval) {
        clearInterval(udpInterval);
        udpInterval = null;
    }
}

udpServer.on('message', (message, rinfo) => {
    try {
        const str = message.toString();
        const arr = str.split(' ');
        const msg = { from: rinfo.address };
        
        for (let i in arr) {
            const parts = arr[i].split(':');
            if (parts.length > 1) {
                msg[parts[0]] = parts[1];
            } else if (parts[0].includes('SN')) {
                const snIndex = parts[0].indexOf('SN');
                msg.number = parts[0].slice(snIndex + 2);
            }
        }
        
        if (msg['Z397-WEB-SW']) {
            const localIPs = getLocalIPs();
            
            const converter = {
                ip: msg.from,
                model: msg['Z397-WEB-SW'] || 'Z397-WEB',
                version: msg['SW'] || 'unknown',
                serialNumber: msg.number || 'unknown',
                L1_Port: msg.L1_Port || '1000',
                L2_Port: msg.L2_Port || '1001',
                L1_Conn: msg.L1_Conn || '0.0.0.0',
                L2_Conn: msg.L2_Conn || '0.0.0.0',
                Lock: msg.Lock || '0',
                mode: 'server',
                lastSeen: Date.now(),
                connected: false,
                speed: state.settings.selectedConverters[msg.from]?.speed || 230400,
                autoReconnect: state.settings.selectedConverters[msg.from]?.autoReconnect || false,
                deleted: false,
                busy: false,
                busyWith: null
            };
            
            const isOurConnection1 = localIPs.includes(msg.L1_Conn);
            const isOurConnection2 = localIPs.includes(msg.L2_Conn);
            
            if (msg.L1_Conn !== '0.0.0.0' && !isOurConnection1) {
                converter.busy = true;
                converter.busyWith = msg.L1_Conn;
            } else if (msg.L2_Conn !== '0.0.0.0' && !isOurConnection2) {
                converter.busy = true;
                converter.busyWith = msg.L2_Conn;
            } else {
                converter.busy = false;
                converter.busyWith = null;
            }
            
            if (isOurConnection1 || isOurConnection2) {
                converter.connected = true;
                if (!state.activeConnections.has(msg.from)) {
                    const virtualSocket = new net.Socket();
                    virtualSocket.remoteAddress = msg.from;
                    state.activeConnections.set(msg.from, virtualSocket);
                }
            }
            
            const existing = state.converters.get(msg.from);
            if (existing) {
                const userSettings = {
                    speed: existing.speed,
                    autoReconnect: existing.autoReconnect,
                    deleted: existing.deleted
                };
                if (existing.connected) {
                    converter.connected = true;
                }
                state.converters.set(msg.from, { ...converter, ...userSettings });
            } else {
                state.converters.set(msg.from, converter);
            }
            
            const conv = state.converters.get(msg.from);
            if (conv.autoReconnect && !conv.deleted && !conv.busy && !state.activeConnections.has(msg.from)) {
                connectToConverter(msg.from);
            }
            
            updateConvertersList();
            saveConverters();
        }
    } catch (e) {
        console.error('Error processing UDP message:', e);
    }
});

// ============== TCP Сервер для клиентских подключений ==============
const tcpServer = net.createServer((socket) => {
    const clientAddress = socket.remoteAddress;
    console.log(`Клиент подключился: ${clientAddress}`);
    
    const converter = state.converters.get(clientAddress);
    if (!converter) {
        const newConverter = {
            ip: clientAddress,
            model: 'Z397-WEB',
            version: 'unknown',
            serialNumber: 'unknown',
            L1_Port: '1000',
            L2_Port: '1001',
            L1_Conn: '0.0.0.0',
            L2_Conn: '0.0.0.0',
            Lock: '0',
            mode: 'client',
            lastSeen: Date.now(),
            connected: true,
            speed: state.settings.selectedConverters[clientAddress]?.speed || 230400,
            autoReconnect: state.settings.selectedConverters[clientAddress]?.autoReconnect || false,
            deleted: false,
            busy: false,
            busyWith: null
        };
        state.converters.set(clientAddress, newConverter);
        saveConverters();
    } else {
        converter.connected = true;
        converter.mode = 'client';
        converter.lastSeen = Date.now();
        state.converters.set(clientAddress, converter);
    }
    
    state.activeConnections.set(clientAddress, socket);
    
    socket.on('data', (data) => {
        console.log('🔴 ДАННЫЕ ОТ КОНВЕРТЕРА:', data.toString('hex'));
        
        sendLogEntry({
            timestamp: new Date().toISOString(),
            ip: clientAddress,
            direction: 'from_converter',
            data: data.toString('hex')
        });
        
        if (socket._apiCallback) {
            socket._apiCallback(data);
            socket._apiCallback = null;
        }
    });
    
    socket.on('close', () => {
        console.log(`Клиент отключился: ${clientAddress}`);
        state.activeConnections.delete(clientAddress);
        const conv = state.converters.get(clientAddress);
        if (conv) {
            conv.connected = false;
            state.converters.set(clientAddress, conv);
            updateConvertersList();
            
            if (conv.autoReconnect && !conv.deleted) {
                setTimeout(() => {
                    connectToConverter(clientAddress);
                }, CONFIG.reconnectDelay);
            }
        }
    });
    
    socket.on('error', (err) => {
        console.error(`Socket error for ${clientAddress}:`, err);
        state.activeConnections.delete(clientAddress);
        const conv = state.converters.get(clientAddress);
        if (conv) {
            conv.connected = false;
            state.converters.set(clientAddress, conv);
            updateConvertersList();
        }
    });
    
    updateConvertersList();
});

tcpServer.listen(CONFIG.tcpPort, '0.0.0.0', () => {
    console.log(`TCP сервер для клиентских подключений запущен на порту ${CONFIG.tcpPort}`);
});

// ============== Функции для работы с конвертерами ==============
function connectToConverter(ip) {
    return new Promise((resolve, reject) => {
        if (state.activeConnections.has(ip)) {
            resolve(state.activeConnections.get(ip));
            return;
        }
        
        const converter = state.converters.get(ip);
        if (!converter) {
            reject(new Error('Конвертер не найден'));
            return;
        }
        
        if (converter.deleted) {
            reject(new Error('Конвертер удален'));
            return;
        }
        
        if (converter.busy) {
            reject(new Error('Конвертер занят другим приложением'));
            return;
        }
        
        if (converter.mode === 'client') {
            reject(new Error('Конвертер в режиме клиента, ожидайте подключения'));
            return;
        }
        
        console.log('🔵 ПОДКЛЮЧЕНИЕ к конвертеру:', ip, 'порт:', converter.L1_Port);
        
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
            socket.destroy();
            console.log('❌ ТАЙМАУТ подключения к:', ip);
            reject(new Error('Таймаут подключения'));
        }, CONFIG.timeout);
        
        socket.connect(parseInt(converter.L1_Port), ip, () => {
            clearTimeout(timeout);
            console.log('✅ ПОДКЛЮЧЕНО к конвертеру:', ip);
            converter.connected = true;
            state.activeConnections.set(ip, socket);
            state.converters.set(ip, converter);
            
            setConverterSpeed(ip, converter.speed)
                .then(() => {
                    updateConvertersList();
                    resolve(socket);
                })
                .catch((err) => {
                    console.error('Error setting speed:', err);
                    resolve(socket);
                });
        });
        
        socket.on('error', (err) => {
            clearTimeout(timeout);
            console.log('❌ ОШИБКА сокета для', ip, ':', err.message);
            converter.connected = false;
            state.converters.set(ip, converter);
            reject(err);
        });
    });
}

function disconnectFromConverter(ip) {
    return new Promise((resolve) => {
        const socket = state.activeConnections.get(ip);
        if (socket) {
            socket.destroy();
            state.activeConnections.delete(ip);
        }
        
        const converter = state.converters.get(ip);
        if (converter) {
            converter.connected = false;
            state.converters.set(ip, converter);
        }
        
        updateConvertersList();
        resolve();
    });
}

function setConverterSpeed(ip, speed) {
    return new Promise((resolve, reject) => {
        const socket = state.activeConnections.get(ip);
        if (!socket) {
            reject(new Error('Нет соединения'));
            return;
        }
        
        let speedBytes;
        switch (speed) {
            case 230400:
                speedBytes = [0x00, 0x03, 0x84, 0x00];
                break;
            case 115200:
                speedBytes = [0x00, 0x01, 0xC2, 0x00];
                break;
            case 38400:
                speedBytes = [0x00, 0x00, 0x96, 0x00];
                break;
            case 9600:
                speedBytes = [0x00, 0x00, 0x25, 0x80];
                break;
            default:
                speedBytes = [0x00, 0x03, 0x84, 0x00];
        }
        
        const command = Buffer.from([0xFF, 0xFA, 0x2C, 0x01, ...speedBytes, 0xFF, 0xF0]);
        console.log('📤 ОТПРАВКА КОМАНДЫ СКОРОСТИ:', command.toString('hex'));
        
        sendLogEntry({
            timestamp: new Date().toISOString(),
            ip: ip,
            direction: 'to_converter',
            data: command.toString('hex')
        });
        
        socket.write(command, (err) => {
            if (err) {
                reject(err);
            }
        });
        
        setTimeout(() => {
            resolve(null);
        }, 1000);
    });
}

function getConverterInfo(ip) {
    return new Promise((resolve, reject) => {
        const socket = state.activeConnections.get(ip);
        if (!socket) {
            reject(new Error('Нет соединения'));
            return;
        }
        
        const command = Buffer.from([0x69, 0x0D]);
        console.log('📤 ОТПРАВКА КОМАНДЫ ИНФОРМАЦИИ:', command.toString('hex'));
        
        sendLogEntry({
            timestamp: new Date().toISOString(),
            ip: ip,
            direction: 'to_converter',
            data: command.toString('hex')
        });
        
        socket.write(command, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            let response = Buffer.alloc(0);
            const onData = (data) => {
                response = Buffer.concat([response, data]);
                if (response.length >= 2 && response[response.length - 1] === 0x0D) {
                    socket.removeListener('data', onData);
                    resolve(response);
                }
            };
            
            socket.on('data', onData);
            
            setTimeout(() => {
                socket.removeListener('data', onData);
                if (response.length > 0) {
                    resolve(response);
                } else {
                    reject(new Error('Таймаут ожидания ответа'));
                }
            }, CONFIG.timeout);
        });
    });
}

// ============== WebSocket Функции ==============

// Отправить ВСЕМ
function broadcastToAll(message) {
    const data = JSON.stringify(message);
    let sent = 0;
    state.wsClients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
            sent++;
        }
    });
    return sent;
}

// Отправить ТОЛЬКО на страницу logs
function sendToLogs(message) {
    const data = JSON.stringify(message);
    let sent = 0;
    state.wsClients.forEach((client) => {
        if (client.page === 'logs' && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
            sent++;
        }
    });
    if (sent === 0) {
        console.log('⚠️ Нет клиентов на странице logs');
    }
    return sent;
}

// Отправить ТОЛЬКО на страницу admin
function sendToAdmin(message) {
    const data = JSON.stringify(message);
    let sent = 0;
    state.wsClients.forEach((client) => {
        if (client.page === 'admin' && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
            sent++;
        }
    });
    return sent;
}

// Отправить конкретному клиенту по ID
function sendToClient(clientId, message) {
    const data = JSON.stringify(message);
    const client = state.wsClients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
        return true;
    }
    return false;
}

// Отправить лог
function sendLogEntry(logData) {
    console.log('📤 sendLogEntry:', logData);
    sendToLogs({
        type: 'log',
        data: logData
    });
}

// Отправить настройки лога
function sendLogSettings(settings) {
    sendToLogs({
        type: 'log_settings_update',
        data: settings
    });
}

// Обновить список конвертеров (всем)
function updateConvertersList() {
    broadcastToAll({
        type: 'converters_update',
        data: Array.from(state.converters.values())
    });
}

// ============== WebSocket Сервер ==============
const wsServer = new WebSocket.Server({ port: CONFIG.wsPort });

wsServer.on('connection', (ws, req) => {
    const clientId = ++clientIdCounter;
    
    let page = 'unknown';
    
    state.wsClients.set(clientId, {
        ws: ws,
        page: page,
        id: clientId
    });
    
    console.log(`📄 WebSocket клиент #${clientId} подключен (всего: ${state.wsClients.size})`);
    
    ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId
    }));
    
    ws.send(JSON.stringify({
        type: 'init',
        data: {
            converters: Array.from(state.converters.values()),
            settings: state.settings
        }
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.page) {
                const client = state.wsClients.get(clientId);
                if (client) {
                    client.page = data.page;
                    console.log(`📄 Клиент #${clientId} → ${data.page}`);
                }
            }
        } catch (e) {
            // Игнорируем
        }
    });
    
    ws.on('close', () => {
        state.wsClients.delete(clientId);
        console.log(`❌ Клиент #${clientId} отключен (осталось: ${state.wsClients.size})`);
    });
    
    ws.on('error', (err) => {
        console.error(`WebSocket ошибка #${clientId}:`, err);
        state.wsClients.delete(clientId);
    });
});

// ============== API Модули ==============
function loadApiModules() {
    const systemApi = {
        generatePagesList: function(params, state) {
            const pagesDir = PATHS.pages;
            if (!fs.existsSync(pagesDir)) {
                return [];
            }
            
            const files = fs.readdirSync(pagesDir);
            const pages = [];
            
            files.forEach(file => {
                if (file.endsWith('.html') && file !== 'list.json') {
                    const filePath = path.join(pagesDir, file);
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        
                        let title = path.basename(file, '.html');
                        let description = '';
                        
                        const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
                        if (titleMatch) {
                            title = titleMatch[1].trim();
                        }
                        
                        const descMatch = content.match(/<h[1-6][^>]*>.*?<\/h[1-6]>.*?<p[^>]*>([^<]*)<\/p>/is);
                        if (descMatch) {
                            description = descMatch[1].trim();
                        }
                        
                        pages.push({
                            name: path.basename(file, '.html'),
                            file: file,
                            title: title,
                            description: description || 'Нет описания'
                        });
                    } catch (e) {
                        console.error(`Error reading page ${file}:`, e);
                    }
                }
            });
            
            const listPath = path.join(PATHS.pages, 'list.json');
            try {
                fs.writeFileSync(listPath, JSON.stringify(pages, null, 2));
            } catch (e) {
                console.error('Error saving pages list:', e);
            }
            
            return pages;
        }
    };
    
    state.apiModules['system'] = systemApi;
    
    const deps = {
        connectToConverter: connectToConverter,
        disconnectFromConverter: disconnectFromConverter,
        setConverterSpeed: setConverterSpeed,
        getConverterInfo: getConverterInfo,
        broadcastToAll: broadcastToAll,
        sendToLogs: sendToLogs,
        sendToAdmin: sendToAdmin,
        sendToClient: sendToClient,
        sendLogEntry: sendLogEntry,
        sendLogSettings: sendLogSettings,
        updateConvertersList: updateConvertersList,
        startUdpSearch: startUdpSearch,
        stopUdpSearch: stopUdpSearch,
        saveSettings: saveSettings,
        saveConverters: saveConverters,
        loadSettings: loadSettings,
        loadConverters: loadConverters,
        state: state
    };
    
    if (fs.existsSync(PATHS.api)) {
        const apiFiles = fs.readdirSync(PATHS.api);
        apiFiles.forEach(file => {
            if (file.endsWith('.js')) {
                const moduleName = path.basename(file, '.js');
                try {
                    const moduleFactory = require(path.join(PATHS.api, file));
                    state.apiModules[moduleName] = moduleFactory(deps);
                    console.log(`API модуль загружен: ${moduleName}`);
                } catch (e) {
                    console.error(`Ошибка загрузки API модуля ${moduleName}:`, e);
                }
            }
        });
    }
}

// ============== HTTP Сервер ==============
const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (pathname === '/api' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                handleApiRequest(data, res);
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }
    
    if (pathname === '/' || pathname === '/index.html') {
        serveFile(path.join(PATHS.public, 'index.html'), res);
        return;
    }
    
    if (pathname.startsWith('/pages/')) {
        const filePath = path.join(PATHS.pages, pathname.replace('/pages/', ''));
        serveFile(filePath, res);
        return;
    }
    
    if (pathname.startsWith('/public/')) {
        const filePath = path.join(PATHS.public, pathname.replace('/public/', ''));
        serveFile(filePath, res);
        return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
});

function serveFile(filePath, res) {
    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('File not found');
        return;
    }
    
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    let contentType = 'text/html';
    
    switch (ext) {
        case '.js': contentType = 'application/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
}

function handleApiRequest(data, res) {
    const { api, cmd, data: params } = data;
    
    if (!api || !cmd) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing api or cmd' }));
        return;
    }
    
    const module = state.apiModules[api];
    if (!module) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `API module "${api}" not found` }));
        return;
    }
    
    const handler = module[cmd];
    if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Command "${cmd}" not found in module "${api}"` }));
        return;
    }
    
    try {
        const result = handler(params, state);
        if (result && typeof result.then === 'function') {
            result
                .then(data => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, result: data }));
                })
                .catch(err => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                });
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
    } catch (e) {
        console.error(`Error executing ${api}.${cmd}:`, e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    }
}

// ============== Запуск приложения ==============
function startApp() {
    console.log('========================================');
    console.log('Z-397 WEB Конвертер Менеджер');
    console.log('========================================');
    
    loadSettings();
    loadConverters();
    loadApiModules();
    
    try {
        const systemApi = state.apiModules['system'];
        if (systemApi && systemApi.generatePagesList) {
            systemApi.generatePagesList({}, state);
            console.log('Список страниц сгенерирован');
        }
    } catch (e) {
        console.error('Error generating pages list:', e);
    }
    
    startUdpSearch();
    
    httpServer.listen(CONFIG.httpPort, '0.0.0.0', () => {
        console.log(`\nHTTP сервер запущен на порту ${CONFIG.httpPort}`);
        const ips = getLocalIPs();
        console.log('Доступные адреса для открытия главной страницы:');
        ips.forEach(ip => {
            console.log(`  http://${ip}:${CONFIG.httpPort}`);
        });
        console.log(`  http://localhost:${CONFIG.httpPort}`);
    });
    
    console.log(`\nWebSocket сервер запущен на порту ${CONFIG.wsPort}`);
    console.log(`UDP поисковый сервер запущен на порту ${CONFIG.udpPort}`);
    console.log(`TCP сервер для клиентских подключений запущен на порту ${CONFIG.tcpPort}`);
    
    console.log('\nДля остановки приложения нажмите Ctrl+C');
    console.log('========================================');
}

process.on('SIGINT', () => {
    console.log('\nОстановка приложения...');
    stopUdpSearch();
    
    state.activeConnections.forEach((socket, ip) => {
        socket.destroy();
    });
    
    saveSettings();
    saveConverters();
    
    udpServer.close();
    tcpServer.close();
    httpServer.close();
    wsServer.close();
    
    console.log('Приложение остановлено');
    process.exit(0);
});

startApp();

module.exports = {
    state: state,
    connectToConverter: connectToConverter,
    disconnectFromConverter: disconnectFromConverter,
    setConverterSpeed: setConverterSpeed,
    getConverterInfo: getConverterInfo,
    broadcastToAll: broadcastToAll,
    sendToLogs: sendToLogs,
    sendToAdmin: sendToAdmin,
    sendToClient: sendToClient,
    sendLogEntry: sendLogEntry,
    sendLogSettings: sendLogSettings,
    updateConvertersList: updateConvertersList,
    startUdpSearch: startUdpSearch,
    stopUdpSearch: stopUdpSearch,
    saveSettings: saveSettings,
    saveConverters: saveConverters,
    loadSettings: loadSettings,
    loadConverters: loadConverters
};