<<<<<<< HEAD
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
=======
const http = require('http'); //клиентский сервер
const fs = require('fs'); //работа с файлами
const WebSocket = require('ws'); //веб соккет
const path = require('path'); //работа с путями
const os = require('os'); //поиск своего IP адреса
const net = require('net'); //TCP socket
const dgram = require('dgram');//UDP socket
const port = 25000;
const port_client=1000;
const port_http=8080;
const port_ws=9090;
//let roles=["manager", "admin"];
const port_udp = 9000;
const broadcast_adr = "255.255.255.255";
const ip_adresses = os.networkInterfaces();
let folder="site";

let converters = []; //список конвертеров
let controllers={};  //список объектов найденных контроллеров по сетевым адресам
let cards={};  //список объектов карт по номерам карт
let t_start;  //отладочная переменная для измерения времени ответа

console.log('Версия 1.1.1');
const Zip = require("adm-zip");

if(fs.existsSync("resources.zip") ){
    const zip = new Zip("resources.zip");
    //log("Unpacking files...");
    zip.extractAllTo(__dirname, false);
    //log("Successfully unpacked!");
}

let host = '10.4.9.117';
for(const i in ip_adresses){ // получаем свой IP адрес для TCP, UDP и HTTP серверов
	for(const k in ip_adresses[i]){
		if(ip_adresses[i][k].family == 'IPv4'){
			if(ip_adresses[i][k].address!="127.0.0.1"){
				host=ip_adresses[i][k].address;
				console.log("HTTP Server running at http://" + host + ':' + port_http)
				console.log("WS Server running at://" + host + ':' + port_ws)
			}
		}
	}
}

const { exec } = require("child_process"); //поиск мак адреса
function os_func() {
    this.execCommand = function(cmd, callback) {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return;
            }

            callback(stdout);
        });
    }
}
var os1 = new os_func();
function mac_print(os1){
	os1.execCommand('arp -a', function (returnvalue) { 
		console.log(returnvalue)
	});
}
//mac_print(os1); //печатаем мак адреса

//UDP server  поиск конвертеров -------------->>-----------------------
const server_udp = dgram.createSocket("udp4");
server_udp.bind(function() {
    server_udp.setBroadcast(true);
	broadcastNew();
    setInterval(broadcastNew, 3000);
    //setTimeout(broadcastNew, 3000);
});
server_udp.on('message', function (message, rinfo) {
	let msg={};
	msg.from=rinfo.address;
	let str=String(message);
	//console.log(str);
	arr=str.split(' ');
	for(let i in arr){
		let k=arr[i].split(':');
		if(i==0){
			msg.model=k[0].slice(0, -3);
		}
		if(k.length>1){
			msg[k[0]]=k[1];
			if(k[0].includes('SW')){
				msg.version=k[1]; 
			}
		}else{
			let ind=k[0].indexOf('SN');
			if(k[0].includes('SN')){
				msg.number=k[0].slice(ind+2); 
			}
		}
	}
	if((msg.L1_Port==port_client)||(msg.L2_Port==port_client)){
		if((msg.L1_Conn=='0.0.0.0')&&(msg.L2_Conn=='0.0.0.0')){
			new_client(msg);
		}
	}
});
function broadcastNew() {
    var message = Buffer.from("SEEK Z397IP");
	//console.log('SEEK');
    server_udp.send(message, 0, message.length, port_udp, broadcast_adr, function() {
    });
}
//-----------------------------------------------------------<<----------------------------

//TCP  client, конвертеры в режиме сервер----------->>>----------------
function new_client(msg){
	let client = new net.Socket();
	let converter;
	client.connect(port_client, msg.from, function() {
		//let number=client.remoteAddress; //converters.length;
		let number=converters.length;
		if(!(client.remoteAddress in converters)){ //проверять по ip?
			console.log('CONNECTED: '+ number+'  ' + client.remoteAddress + ':' + client.remotePort);
			//client.write(Buffer.from([0xFF, 0xFA, 0x2C, 0x01, 0x00, 0x00, 0x96, 0x00, 0xFF, 0xF0]));// для modbus 38400
			//client.write(Buffer.from([0xFF, 0xFA, 0x2C, 0x01, 0x00, 0x03, 0x84, 0x00, 0xFF, 0xF0]));//Для  "ADVANCED"
			converters[number]=new Converter(client, msg);
			converter=converters[number];
			converter.count=number;//номер по порядку подключения
			//начинаем поиск контроллеров
			setTimeout(()=>func_api.finding_controllers_start(converters[number]), 700);
		}else{
			//converter=converters[number];
			//converter.count=number;//номер по порядку подключения
			//converter.socket=client;
			//converter.connected=true;
			//console.log('OLD CONNECTED: '+ msg.number+'  ' + client.remoteAddress + ':' + client.remotePort);
			//converter.q_fast=[];
			//converter.i_fast=-1;
			//converter.q_main=[]; //объекты очереди {func, data, callback} - ссылка на функцию команды, данные команды, куда вернуть ответ 
			//converter.i_main=-1
			//setTimeout(()=>func_api.finding_controllers_start(converters[number]), 700);
		}
	});
	client.on('data', function(data) {
		converter.listener(data);
		converter.last_answer=+(new Date());
	});
	client.on('close', function() {
		//тут перед сообщением нужно проверить, есть ли сейчас соединение - как это сделать?
		//if(converter.last_answer+3000<+(new Date())){
		//	console.log('close');
			converter.connected=false;
			converter.q_fast=[];
			converter.i_fast=-1;
			converter.q_main=[]; //объекты очереди {func, data, callback} - ссылка на функцию команды, данные команды, куда вернуть ответ 
			converter.i_main=-1
		//}
	});
	client.on('error', function() {
		//	console.log('error');
		//	converter.connected=false;
	});
}
//----------------------------<<<------------------------------


//TCP server,  конвертеры в режиме клиент -------------->>>-------
const server = net.createServer();
server.listen(port, host, () => {
console.log('TCP Server running at ' + host + ' port '+ port);
});

server.on('connection', function(sock) {
	let msg ={model:"z-397 web", number:"123", version:"567"};
	let converter;
	//let number=sock.remoteAddress; //converters.length;
	let number=converters.length;
	if(!(sock.remoteAddress in converters)){
		console.log('CONNECTED: '+ number+'  ' + sock.remoteAddress + ':' + sock.remotePort);
		converters[number]=new Converter(sock, msg);
		converter=converters[number];
		converter.count=number;//номер по порядку подключения
		//начинаем поиск контроллеров
		setTimeout(()=>func_api.finding_controllers_start(converters[number]), 700);
	}else{
		//converter=converters[number];
		//converter.socket=sock;
		//converter.count=number;//номер по порядку подключения
		//converter.connected=true;
		//console.log('OLD CONNECTED: '+ msg.number+'  ' + sock.remoteAddress + ':' + sock.remotePort);
		//converter.q_fast=[];
		//converter.i_fast=-1;
		//converter.q_main=[]; //объекты очереди {func, data, callback} - ссылка на функцию команды, данные команды, куда вернуть ответ 
		//converter.i_main=-1
		//setTimeout(()=>func_api.finding_controllers_start(converters[number]), 700);
	}
	sock.on('data', function(data) {
		converter.listener(data);
		converter.last_answer=+(new Date());
	});
	sock.on('error', function(data) {
		//console.log("error from ");
	});
	sock.on('close', function(data) {
		//if(converter.last_answer+3000<+(new Date())){
			//console.log('long wait');
			converter.connected=false;
			converter.q_fast=[];
			converter.i_fast=-1;
			converter.q_main=[]; //объекты очереди {func, data, callback} - ссылка на функцию команды, данные команды, куда вернуть ответ 
			converter.i_main=-1
		//}
	});
});
//--------------<<<------------------------------------------------------


//HTTP сервер,  получаем команды API ---------->>>--------------
const server_http = http.createServer((req, res) => {
    let first_url=req.url;
	if(req.method=='GET'){ // запросы страниц
		send_file( res, first_url);
	}
	if(req.method=='POST'){ // запросы API
		send_post(req, res);
	}
}); 
server_http.listen(port_http);

//WS server,  админ в режиме клиент -------------->>>-------
const wsServer = new WebSocket.Server({ port: port_ws });
wsServer.on('connection', onConnect);
let list_cl={}; //список подключений
let num=0;
var admins=new Map();//список карт
//var socket_controllrts=[];//список номеров контроллеров в режиме сокет

function onConnect(wsClient) {
	let api_key='1356_api';
	let id=num++;
	list_cl[id]=wsClient;
	function fnk(thet){
		let answer={};
		answer.api='trigger_info';
		answer.trigger_info=thet.trigger_info;
		answer.trigger_info.data=thet.data;
		wsClient.send(JSON.stringify(answer));
	};
	list_cl[id].callback=fnk;
    console.log('Новый пользователь'+id);

    list_cl[id].on('close', function(){
        console.log('Пользователь отключился '+id);
		delete list_cl[id];
		//delete socket_controllrts[id];
		admins.delete(id);
    });

    list_cl[id].on('message', function(message) {
		let answer={};
        try {
            let jsonObj = JSON.parse(message);
			answer.check_admin=0;
			if('api_key' in jsonObj){
				if(jsonObj.api_key==api_key){
					answer.check_admin=1;
					answer.api=jsonObj.api;
					if(jsonObj.api in out_api){
						out_api[jsonObj.api](jsonObj, list_cl[id], answer);  //req, res, answer
					}else{
						answer.info='wrong api';
						list_cl[id].send(JSON.stringify(answer));
					}
				}else{
					answer.info='wrong api_key';
					list_cl[id].send(JSON.stringify(answer));	
				}
			}else{
				answer.info='wrong messade';
				list_cl[id].send(JSON.stringify(answer));
			}
        } catch (error) {
            console.log('Ошибка', error);
        }
    });
}

function send_file( res, first_url){
    //let mimeType;
    let new_url;
    //исправляем кодировку   
    try{
        new_url=decodeURIComponent(first_url);   
    }
    catch(e){
        res.statusCode = 400;  
        res.end("Bad reques");
        return;
    }
    // проверяем отсутствие 0 байта
    if(~new_url.indexOf('\0')){
        res.statusCode = 400;  
        res.end("Realy Bad reques");
        return;
    }
	//полный путь к файлу

	let mimeType=path.extname(new_url);
	if(!new_url.includes(folder)){
		new_url=path.normalize(path.join("\\", folder, new_url));
	}
    // проверяем путь
	let all_url=path.normalize(path.join(__dirname,new_url));

	if(!mimeType){
		mimeType=".html";
		all_url=path.normalize(path.join(all_url,"/index.html"));
	}
	fs.stat(all_url,  function(err, st){
		
		fs.readFile(all_url, function(err, content, the_type=mimeType) { 
			if (err){
				console.log("no file");
				res.writeHead(400,{'Content-Type':'text'});
				res.end('no file');
			}else{
				res.writeHead(200,{'Content-Type':the_type});
				res.end(content);
			}				
		});
	});
}

function send_post(req, res){
    let body = [];
    req.on('error', function(err) {
        console.error(err);
    }).on('data', function(chunk) {
        body.push(chunk);
    }).on('end', function() {
        body = Buffer.concat(body).toString();
        try {
            //let obj={}; 
			let data = JSON.parse(body);
			//obj.role=path.basename(req.url);
			//if(roles.includes(obj.role)){
				if(data.command in out_api){
					//if(data.conv){
					//	func_api.queue_add(converters[data.conv], {reg:req, res:res, data:data, obj:obj}, out_api[data.command]);
					//}else{
						out_api[data.command](req, res, data);
					//}
				}else{
					functions.answer_send(res, "no the command");
				}
			//}else{
			//	functions.answer_send(res, "no the role");
			//}	
        } catch (e) {
            console.error(e);
        }
        res.on('error', function(err) {
            console.error(err);
        });
    });	
}
//--------------<<<------------------------------------

class Converter{
	constructor(socket, msg) {
		
		this.socket=socket;
		this.q_fast=[];
		this.i_fast=-1;
		this.q_main=[]; //объекты очереди {func, data, callback} - ссылка на функцию команды, данные команды, куда вернуть ответ 
		this.i_main=-1; //номер в очереди
		this.survey=''; // интервал сканирования
		this.finding='';//интервал поиска
		this.scan_count=1;
		this.scan_controllers=5;
		this.scan_current=0;
		this.pause=5;//Пауза перед отправкой
		this.wait=200;//Ожидание до нет ответа
		this.timer; //указатель на текущий таймер ответа - для перехода в случае не ответа
		this.count=0;//номер конвертера в порядке подключения
		this.number=msg.number;
		this.version=msg.version;
		this.model=msg.model;
		this.type="fast";
		this.current='';//указатель на текущую операцию
		this.addresses={}; //адреса контроллеров в сети RS485, объект объектов  {type, number, active}
		this.connected=true;
		this.test=+new Date();
		this.pk=0;
		this.answer_length=[0,13,0,0,17,0,8];
		this.count_out=0; //test
		this.count_in=0; //test
		this.last_answer= +(new Date());
	}
	add(q_type, data, receiver=func_api.survey_receiver, callback=''){
		let obj={data:data, receiver:receiver, callback:callback};
		let start=0;
		if(this.i_fast==-1&&this.i_main==-1){
			start=1;
		}
		this[q_type].push(obj);
		if(start){
			this.next();
		}
	}
	next(){
		if(this.i_fast<this.q_fast.length-1){
			step ("fast", this);
		}else{
			this.i_fast=-1;
			this.q_fast=[];
			if(this.i_main<this.q_main.length-1){
				step ("main", this);
			}else{
				this.i_main=-1;
				this.q_main=[];
				if(this.connected){
					func_api.survey_make(this);
				}
			}
		}
		function step (type, thet){
			let i="i_"+type;
			let q="q_"+type;
			thet[i]++;
			thet.type=type;
			thet.current=thet[q][thet[i]];
		//thet.count_out++;	
			if(thet.current){
				thet.socket.write(thet.current.data);
				thet.timer=setTimeout(()=>{
					clearTimeout(thet.timer);
					thet.current.receiver(thet, thet.current.data, false);
					thet.next();
				}, thet.wait); //время ожидания ответа 
			}
		}
	}
	listener(data){
		//let tt=+new Date();
		//console.log(tt-this.test);
		//this.test=tt;
		//this.count_in++;
		//console.log(this.count_in);
		//console.log(this.count_out);		
		let msg=data.subarray(0,data.length-2);
		let dd=func_api.getCRC(msg);
		//console.log(dd[0].toString(16)+dd[1].toString(16) );
		//console.log(data.subarray(data.length-2));
		if(data.length>=this.answer_length[data[1]]){
			let check=1;
			for (let j=0; j<1; j++){
				if(+this.current.data[j]!=+data[j]){
					check=0;
					//console.log('check = 0');
				}
			}
			if(check){

				clearTimeout(this.timer);
				this.current.receiver(this, data, true);
				setTimeout(()=>this.next(), this.pause);
			}
		}else{
			//console.log('short');
		}
	}
}

class Controller{
	constructor(type, number, converter, address) {
		this.converter=converter; //конвертер к которому подключен этот контроллер
		this.converter_count=converter.count; //номер конвертера к которому подключен этот контроллер
		this.address=address; //сетевой RS485 адрес контроллера 
		this.type=type; //тип контроллера 
		this.number=number; //серийный номер контроллера
		this.active=true; //отвечает или нет
		this.request='';
		this.triggers=[]; //активные триггеры
		this.pattern={}; //итоговый объект для работы с триггерами
		this.data; //буффер последнего ответа
		this.bit_for_out=4; //бит контакта управлениея замком на выход
		this.bit_for_in=2; //бит контакта управлениея замком на вход
		this.time_open_s=3; //старший байт времени открытия замка
		this.time_open_m=5; //младший байт времени открытия замка
		//this.add_trigger({type:"door", sost:32, callback:this.closed_for_out});
		//this.add_trigger({type:"door", sost:0, callback:this.closed_for_in});
		//this.add_trigger({type:"tm", sost:4, callback:this.open_for_in});
		//this.add_trigger({type:"card_in", sost:8, callback:func_api.test});
		//this.add_trigger({type:"exit", sost:1, callback:this.open_for_out});
		//this.add_trigger({type:"card_out", sost:2, callback:func_api.test});
		//this.add_trigger({type:"card_in", sost:8, callback:func_api.test});
		//this.add_trigger({type:"v_door", sost:128, callback:func_api.test});
		//this.add_trigger({type:"v_door", sost:128, callback:func_api.test1});
		//this.add_trigger({type:"v_led", sost:0, callback:func_api.test});
		//this.add_trigger({type:"v_zp", sost:128, callback:this.open_for_out});
		//this.add_trigger({type:"va_zp", min:-20, max:100, dev:10, callback:func_api.test1});
		//this.add_trigger({type:"va_zp", min:-12, max:100, dev:10, callback:func_api.test});
		//this.add_trigger({type:"va_led", min:-20, max:100, dev:10, callback:func_api.test1});
		//this.add_trigger({type:"va_door", min:-20, max:100, dev:10, callback:func_api.test1});
	}
	add_trigger(trigger_set){
		let trigger_id;
		let obj_trg={};
		if(trigger_set.type in func_api.types){ 
			for(let item in func_api.types[trigger_set.type]){
				obj_trg[item]=func_api.types[trigger_set.type][item];
			}
			for(let j in trigger_set){
				obj_trg[j]=trigger_set[j];
			}
			obj_trg.temp=false;
			trigger_id=this.triggers.push(obj_trg)-1;
		}
		this.make_patern();
		return trigger_id;
	}
	make_patern(){
		this.pattern={};
		for(let i=0; i<this.triggers.length; i++){ //создаем объект pattern
			if(!this.triggers[i].min){
				if(this.triggers[i].byte_num in this.pattern){
					if(this.triggers[i].bits in this.pattern[this.triggers[i].byte_num].bits){
						if(String(this.triggers[i].sost) in this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost){
							this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost[this.triggers[i].sost].push(this.triggers[i].callback);
						}else{
							this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost[this.triggers[i].sost]=[this.triggers[i].callback];
						}
					}else{
						this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits]={type:this.triggers[i].type, sost:{}};
						this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost[this.triggers[i].sost]=[this.triggers[i].callback];
					}
				}else{
					this.pattern[this.triggers[i].byte_num]={for_all:0, bits:{}, temp:0};
					this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits]={type:this.triggers[i].type, sost:{}};
					this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost[this.triggers[i].sost]=[this.triggers[i].callback];
				}
			}else{
				if(this.triggers[i].byte_num in this.pattern){
					if(this.pattern[this.triggers[i].byte_num].a){
						//console.log('add a');
						//console.log(this.pattern[this.triggers[i].byte_num].a);
						this.pattern[this.triggers[i].byte_num].a.push(this.triggers[i]);
					}else{
						//console.log('new a');
						//console.log(i);
						this.pattern[this.triggers[i].byte_num].a=[this.triggers[i]];
					}
				}else{
					//console.log('new byte_num');
					this.pattern[this.triggers[i].byte_num]={a:[this.triggers[i]]}; //массив триггеров внутри байта
				}
			}
		}
		for(let byte_num in this.pattern){  //создаем шаблоны
			if(this.pattern[byte_num].bits){
				let for_all=0;
				for (let bits in this.pattern[byte_num].bits){
					for_all=(+for_all)|(+bits);
				}
				this.pattern[byte_num].for_all=for_all;
			}
		}
	}
	dell_trigger(trigger_id){
		this.triggers.splice(trigger_id, 1);
		this.make_patern();
	}
	trigger(data){
		if(data[1]==4){

			this.data=data;
			for(let byte_num in this.pattern){ //перебираем байты п списке триггеров, сверяем с соответствующим байтом в ответе 
				if(this.pattern[byte_num].bits){ //битовый шаблом
					let temp_data=(+data[byte_num])&(+this.pattern[byte_num].for_all);
					if(temp_data!=this.pattern[byte_num].temp){	
						for(let bits in this.pattern[byte_num].bits){ //перебираем биты
							if(+(temp_data&bits)!=+(this.pattern[byte_num].temp&bits)){
								for(let sost in this.pattern[byte_num].bits[bits].sost){ //состояния
									if(temp_data==sost){
										//console.log('yes');
										for (let cb=0; cb<this.pattern[byte_num].bits[bits].sost[sost].length; cb++){//колбэки
											//this.pattern[byte_num].bits[bits].sost[sost][cb](this.number+' / '+ this.pattern[byte_num].bits[bits].type+' / '+temp_data);
											this.trigger_info={api:'trigger_info', controller:this.type+'_'+this.number, name: func_api.type_info[byte_num][bits], sost:sost};
											//console.log(this.trigger_info);
											this.pattern[byte_num].bits[bits].sost[sost][cb](this);
										} 
									}
								}
							}
						}
						this.pattern[byte_num].temp=temp_data;
					}
				}
				if(this.pattern[byte_num].a){//сравнение по значениям <>
					let val=(+data[byte_num]);
					for(let k=0; k< this.pattern[byte_num].a.length; k++){
						if((val< this.pattern[byte_num].a[k].min-this.pattern[byte_num].a[k].dev)||(val> this.pattern[byte_num].a[k].max+this.pattern[byte_num].a[k].dev)){
							if(this.pattern[byte_num].a[k].temp){
								this.pattern[byte_num].a[k].temp=false;
							}
						}
						if((val> (+this.pattern[byte_num].a[k].min)+(+this.pattern[byte_num].a[k].dev))&&(val< (+this.pattern[byte_num].a[k].max)-(+this.pattern[byte_num].a[k].dev))){
							if(!this.pattern[byte_num].a[k].temp){
								this.pattern[byte_num].a[k].temp=true;
								//this.pattern[byte_num].a[k].callback(this.number+' / '+ this.pattern[byte_num].a[k].type+' / '+val);
								this.trigger_info={api:'trigger_info', controller:this.type+'_'+this.number ,name: func_api.type_info[byte_num], a:this.pattern[byte_num].a[k]};
								//console.log(this.trigger_info);
								this.pattern[byte_num].a[k].callback(this);
							}
						}					
					} 
				}
			}
		}

	}
	open_for_out(thet=this){
		func_api.output(thet, thet.bit_for_out, thet.time_open_s, thet.time_open_m); //thet, bit=0x04, intervals=0, intervalm=0
		func_api.output(thet, 3, 0, 125); 
	}
	closed_for_out(thet=this){
		func_api.output(thet, thet.bit_for_out, 0, 1);
		func_api.output(thet, 3,  0, 1); //thet, bit=0x04, intervals=0, intervalm=0
	}
	open_for_in(thet=this){
		func_api.output(thet, thet.bit_for_in, thet.time_open_s, thet.time_open_m); //thet, bit=0x04, intervals=0, intervalm=0
		func_api.output(thet, 3, thet.time_open_s, thet.time_open_m); //thet, bit=0x04, intervals=0, intervalm=0
	}
	closed_for_in(thet=this){
		func_api.output(thet, thet.bit_for_in, 0, 1);
		func_api.output(thet, 3,  0, 1); //thet, bit=0x04, intervals=0, intervalm=0
	}
}

let out_api={
	controllers_list(req, res, answer){  //jsonObj, list_cl[id], answer);  //req, res, answer
		let obj={};
		for(let i in controllers){
			obj[i]={type: controllers[i].type, number: controllers[i].number, address: controllers[i].address, triggers: controllers[i].triggers};
		}
		answer.list=obj;
		res.send(JSON.stringify(answer));
	},
	triggers_type(req, res, answer){  //jsonObj, list_cl[id], answer);  //req, res, answer
		answer.list=func_api.types;
		res.send(JSON.stringify(answer));
	},
	converters_list(req, res, answer){  
		let obj={};
		for(let i=0; i<converters.length; i++){
			obj[i]={model: converters[i].model, number: converters[i].number, version: converters[i].version};
		}
		answer.list=obj;
		res.send(JSON.stringify(answer));
	},
	open_for_out(req, res, answer){  
		controllers[req.controller].open_for_out();
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	open_for_in(req, res, answer){  
		controllers[req.controller].open_for_in();
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	green(req, res, answer){  
		let thet=controllers[req.controller];
		func_api.green(thet, func_api.plus(req.interval));//req.interval значение в сек
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	red(req, res, answer){  
		let thet=controllers[req.controller];
		func_api.red(thet, func_api.plus(req.interval));//req.interval значение в сек
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	sound(req, res, answer){  
		let thet=controllers[req.controller];
		func_api.sound(thet, func_api.plus(req.interval));//req.interval значение в сек
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	d0(req, res, answer){  
		let thet=controllers[req.controller];
		func_api.d0(thet, func_api.plus(req.interval));//req.interval значение в сек
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	d1(req, res, answer){  
		let thet=controllers[req.controller];
		func_api.d1(thet, func_api.plus(req.interval));//req.interval значение в сек
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	lock(req, res, answer){  
		let thet=controllers[req.controller];
		func_api.lock(thet, func_api.plus(req.interval));//req.interval значение в сек
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	new_address(req, res, answer){  
		let thet=controllers[req.controller];
		func_api.new_address(thet, req.new_adr);//req.interval значение в сек
		answer.ok=1;
		res.send(JSON.stringify(answer));
	},
	pattern_list(req, res, answer){  //отладочная функция
		let thet=controllers[req.controller];
		//console.log(req.controller);
		//console.log(thet.pattern);
		//answer.pattern_list=JSON.stringify(thet.pattern);
		answer.pattern_list=thet.pattern;
		res.send(JSON.stringify(answer));
	},
	trigger_add_ind(req, res, answer){  
		let thet=controllers[req.controller];
		
		if(req.type.slice(0, 2)=='va'){
			thet.add_trigger({type:req.type, min:req.min, max:req.max, dev:req.dev, callback:res.callback});
		}else{
			thet.add_trigger({type:req.type, sost:req.sost, callback:res.callback});
		}
		answer.ok=1;
		answer.controller=req.controller;
		answer.triggers=controllers[req.controller].triggers;
		res.send(JSON.stringify(answer));
	},
	trigger_add(req, res, answer){  
		let thet=controllers[req.controller];
		if(req.type.slice(0, 2)=='va'){
			thet.add_trigger({type:req.type, min:req.min, max:req.max, dev:req.dev, callback:func_api.callback});
		}else{
			thet.add_trigger({type:req.type, sost:req.sost, callback:func_api.callback});
		}
		answer.ok=1;
		answer.controller=req.controller;
		answer.triggers=controllers[req.controller].triggers;
		res.send(JSON.stringify(answer));
	},
	trigger_add_sys(req, res, answer){  
		let thet=controllers[req.controller];
		if(req.obj=='thet'){
			if(req.type.slice(0, 2)=='va'){
				thet.add_trigger({type:req.type, min:req.min, max:req.max, dev:req.dev, callback:thet[req.callback]});
			}else{
				thet.add_trigger({type:req.type, sost:req.sost, callback:thet[req.callback]});
			}
		}
		if(req.obj=='func_api'){
			if(req.type.slice(0, 2)=='va'){
				thet.add_trigger({type:req.type, min:req.min, max:req.max, dev:req.dev, callback:func_api[req.callback]});
			}else{
				thet.add_trigger({type:req.type, sost:req.sost, callback:func_api[req.callback]});
			}
		}
		answer.ok=1;
		answer.controller=req.controller;
		answer.triggers=controllers[req.controller].triggers;
		res.send(JSON.stringify(answer));
	},
	trigger_dell(req, res, answer){ 
//console.log('controller  - '+req.controller);
//console.log('obj  - '+controllers[req.controller]);
//console.log('number  - '+controllers[req.controller].number);	
		controllers[req.controller].dell_trigger(req.trigger_id);
		answer.ok=1;
		answer.controller=req.controller;
		answer.triggers=controllers[req.controller].triggers;
		res.send(JSON.stringify(answer));
	},
};

function type_i(){
	let temp={};
	for(let i in func_api.types){
		if(!temp[func_api.types[i].byte_num]){
			temp[func_api.types[i].byte_num]={};
		}
		if(func_api.types[i].bits){
			temp[func_api.types[i].byte_num][func_api.types[i].bits]=i;
		}else{
			temp[func_api.types[i].byte_num]=i;
		}
	}
	func_api.type_info=temp;
	//console.log(func_api.type_info);
}

let func_api={
	types:{
		led:{byte_num:3, bits:1},
		zumm:{byte_num:3, bits:2},
		sound:{byte_num:3, bits:4},
		lock:{byte_num:3, bits:8},
		tm:{byte_num:4, bits:4},
		card_in:{byte_num:4, bits:8},
		exit:{byte_num:4, bits:1},
		card_out:{byte_num:4, bits:2},
		reader:{byte_num:4, bits:16},	
		door:{byte_num:4, bits:32},
		v_door:{byte_num:11, bits:127},
		v_led:{byte_num:12, bits:127},
		v_zp:{byte_num:13, bits:127},
		v_12:{byte_num:14, bits:127},
		va_door:{byte_num:11, min:-20, max:100, dev:10},
		va_led:{byte_num:12, min:-20, max:100, dev:10},
		va_zp:{byte_num:13, min:-20, max:100, dev:10},
		va_12:{byte_num:14, min:-20, max:100, dev:10},
	},
	outputs:{
		led:{byte_num:3, value:1},
		zumm:{byte_num:3, value:2},
		sound:{byte_num:3, value:3},
		lock:{byte_num:3, value:4},	
		data0:{byte_num:3, value:5},
		data1:{byte_num:3, value:6},
	},
	minus(value){
		return new Uint8Array(new Uint16Array([~(128*(-value))+1]).buffer);
	},
	plus(value){
		return new Uint8Array(new Uint16Array([128*value]).buffer);
	},	
	va(data){
		
	},
	test(data){
		console.log("test "+data);
	},
	test1(data){
		console.log("test1 "+data);
	},
	buff_sum(arr){
		let lng_all=0;
		for(let i=0; i<arr.length; i++){
			lng_all=lng_all+arr[i].byteLength;
		}
		let bfull = new Uint8Array(lng_all);
		let offset=0;
		for(let i=0; i<arr.length; i++){
			bfull.set(arr[i],offset);
			offset=offset+arr[i].byteLength;
		}
		return bfull;
	},
	getCRC(buffer){
		let crc = new Uint16Array([0xffff]);
		let n = buffer.byteLength;
		let c_summ=0;
		for(j=0;j<n;j++){
			crc=crc^=Number(buffer[j]);
			for(let i=0;i<8;i++){
				if(crc&1){
					crc >>= 1;
					crc ^= 0xA001;
				} else {
					crc >>= 1;
				}
			}
		}
		return new Uint8Array(new Uint16Array([crc]).buffer);
	},
	console(thet, data, ok){
		if(ok){
			console.log(data);
		}else{
			console.log(thet.current.data);
		}
	},
	survey_receiver(thet, data, ok){
		if(ok){
			if(thet.addresses[thet.current.data[0]].active==false){
				console.log(thet.current.data[0]+" active");
				thet.addresses[thet.current.data[0]].active=true;
			}
			if(thet.addresses[thet.current.data[0]].trigger){
				thet.addresses[thet.current.data[0]].trigger(data);
			}
		}else{
			let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
			let data_out = func_api.buff_sum([adr, func_api.getCRC(adr)]);
			thet.add("q_fast", data_out, func_api.no_ansver_0);
			//if(thet.addresses[thet.current.data[0]].active==true){
				//console.log(thet.current.data[0]+" no aсtive");
			//	thet.addresses[thet.current.data[0]].active=false;
			//}
			//console.log('no ansver 1 - '+ data[0]);
		}
	},
	no_ansver_0(thet, data, ok){
		if(ok){
			if(thet.addresses[thet.current.data[0]].active==false){
				console.log(thet.current.data[0]+" active");
				thet.addresses[thet.current.data[0]].active=true;
			}
		}else{
			let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
			let data_out = func_api.buff_sum([adr, func_api.getCRC(adr)]);
			thet.add("q_fast", data_out, func_api.no_ansver);
			//console.log('no ansver 2 - '+ data[0]);
		}
	},
	no_ansver(thet, data, ok){
		if(ok){
			if(thet.addresses[thet.current.data[0]].active==false){
				console.log(thet.current.data[0]+" active");
				thet.addresses[thet.current.data[0]].active=true;
			}
		}else{
			//console.log('no ansver 3 - '+ data[0]);
			if(thet.addresses[thet.current.data[0]].active==true){
				console.log(thet.current.data[0]+" no active");
				thet.addresses[thet.current.data[0]].active=false;
				//console.log('no ansver 3 - '+ data[0]);
			}
		}
	},
	new_controller(thet, data, ok){//получаем информацию о контроллере
		if(ok){
			let number=(+data[10])*256 + (+data[9]);
			let type=(+data[3]);
			if(controllers[type+"_"+number]){
				if(thet.count!=controllers[type+"_"+number].converter_count){
					controllers[type+"_"+number].converter_count=thet.count;
					controllers[type+"_"+number].converter=thet;
					//controllers[type+"_"+number].address=data[0];
					thet.addresses[data[0]]=controllers[type+"_"+number];
					//console.log(controllers[type+"_"+number]);
					//if(!thet.addresses[data[0]].request){
					//	let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
					//	thet.addresses[data[0]].request = func_api.buff_sum([adr, func_api.getCRC(adr)]);
					//}
					//controllers[type+"_"+number].data=data;
				}
				if(controllers[type+"_"+number].address!=data[0]){
					controllers[type+"_"+number].address=data[0];
					let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
					let data_out = func_api.buff_sum([adr, func_api.getCRC(adr)]);
					thet.addresses[data[0]].request=data_out; //сохраняем запрос для повторного использования
				}
			}else{
				controllers[type+"_"+number]=new Controller (type, number, thet, data[0]);
				console.log(thet.current.data[0]+" New - "+number);
				//общее оповещение всем абонентам
				let trigger_info={api:'trigger_info', controller:type+'_'+number, name:'new controller', sost:1};
				//console.log(controllers[type+"_"+number]+"  "+trigger_info);
				func_api.for_all_user(trigger_info);
				thet.addresses[data[0]]=controllers[type+"_"+number];
				let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
				let data_out = func_api.buff_sum([adr, func_api.getCRC(adr)]);
				thet.addresses[data[0]].request=data_out; //сохраняем запрос для повторного использования
			}
		}
	},
	finding_controllers_receiver(thet, data, ok){ //ответ на поиск контроллера
		if(ok){
			let adr = new Uint8Array([data[0], 0x01, 0x00, 0x00, 0x00, 0x05]); //запрос информации о контроллере
			let data_out = func_api.buff_sum([adr, func_api.getCRC(adr)]);
			if(thet.addresses[data[0]]){
				if(!thet.addresses[data[0]].active){
					thet.addresses[data[0]].active=true;
					thet.add("q_fast", data_out, func_api.new_controller);
					console.log(thet.current.data[0]+" active");
				}
			}else{
				thet.addresses[data[0]]={active:true}
				thet.add("q_fast", data_out, func_api.new_controller);
			}
		}else{
			if(thet.addresses[thet.current.data[0]]){
				if(thet.addresses[thet.current.data[0]].active){
					thet.addresses[thet.current.data[0]].active=false;
					console.log(thet.current.data[0]+" no active");
				}
			}
		}
	},
	finding_controllers_start(converter){ //нужно переделать, поиск должен быть по одному на каждый опрос
		for(let i=0; i<converter.scan_count; i++){
			func_api.finding_make(converter);
		}
		//converter.finding=setInterval(()=>{
		//	func_api.finding_make(converter);
		//	console.log("Start finding");
		//	console.log(converter.scan_count);
		//}, converter.wait*500);
	},
	finding_make(converter){
		//console.log('finding start');
		//console.log(converter.count);
		//console.log(converter.addresses);
		for (let i=0; i<40; i++){
			let adr = new Uint8Array([i, 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
			let data = func_api.buff_sum([adr, func_api.getCRC(adr)]);
			converter.add("q_main", data, func_api.finding_controllers_receiver);
		}
	},
	survey_make(converter){
		for(let i in converter.addresses){
			//let adr = new Uint8Array([i, 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
			//let data = func_api.buff_sum([adr, func_api.getCRC(adr)]);
			if(converter.addresses[i].request){
				converter.add("q_main", converter.addresses[i].request);
			}else{
				let adr = new Uint8Array([i, 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
				let data = func_api.buff_sum([adr, func_api.getCRC(adr)]);
				converter.addresses[i].request=data;
				converter.add("q_main", data, func_api.finding_controllers_receiver);
			}
		}
		if(converter.scan_current<converter.scan_controllers){
			converter.scan_current++;		
		}else{
			converter.scan_current=0;
		}
		if(!(converter.scan_current in converter.addresses)){
			let adr = new Uint8Array([converter.scan_current, 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
			let data = func_api.buff_sum([adr, func_api.getCRC(adr)]);
			converter.add("q_main", data, func_api.finding_controllers_receiver);
		}
		
	},
	answer_send(res, msg){ // отправка сообщения API = HTTP сервер
		res.writeHead(200);
		if(typeof(msg)=="object"){
			res.end(JSON.stringify(msg));
			//console.log("send object");
		}else{
			res.end(msg);
			//console.log(msg);
		}
	},
	output(thet, bit=0x04, intervals=0, intervalm=0xff ){
		let adr = new Uint8Array([thet.address, 0x06, 0x00, bit, intervals, intervalm]); //открытие замка
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	green(thet, interval=2){
		let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x01,  interval[1], interval[0]]); //зеленый - контакт LED
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		//console.log('controller');
		//console.log(thet.address);
		//console.log(thet.address);
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	red(thet, interval=2){
		let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x02, interval[1], interval[0]]); //красный - контакт ZUMM
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		//console.log(thet);
		//console.log(thet.address+' address');
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	sound(thet,  interval=2){
		let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x03,  interval[1], interval[0]]); //звук - звук контроллера
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	d0(thet, interval=2){
		let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x05, interval[1], interval[0]]); //зеленый
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	d1(thet, interval=2){
		let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x06, interval[1], interval[0]]); //зеленый
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	lock(thet, interval=0){
		let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x04, interval[1], interval[0]]); //зеленый
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	new_address(thet, new_ard=2){
		let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x10, new_ard, new_ard]); //смена адреса,  - повтор адреса для защиты от ошибок
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	get_info(thet){
		let adr = new Uint8Array([thet.address, 0x01, 0x00, 0x00, 0x00, 0x05]); //инфо о контроллере
		let data = this.buff_sum([adr, this.getCRC(adr)]);
		thet.converter.add("q_fast", data);//функция добавления в очередь
	},
	for_all_user(trigger_info){
		//console.log(JSON.stringify(trigger_info));
		for(let i in list_cl){
			console.log(i);
			list_cl[i].send(JSON.stringify(trigger_info));
		}
	},
	callback(thet){
		let answer={};
		answer.api='trigger_info';
		answer.trigger_info=thet.trigger_info;
		answer.trigger_info.data=thet.data;
		//wsClient.send(JSON.stringify(answer));
		for(let i in list_cl){
			console.log(i);
			list_cl[i].send(JSON.stringify(answer));
		}
	},
};

type_i();

>>>>>>> b819409a909ae4c7af21a2e3fa01ef50d18e3079
