const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const net = require('net');

// Модули
const Converter = require('./modules/converter');
const ConverterFinder = require('./modules/converterFinder');
const PageGenerator = require('./modules/pageGenerator');
const ApiModule = require('./modules/api');

// Конфигурация
const CONFIG = {
    httpPort: 8080,
    tcpPort: 1000,
    udpPort: 9000
};

// Пути
const PATHS = {
    modules: path.join(__dirname, 'modules'),
    pages: path.join(__dirname, 'pages'),
    public: path.join(__dirname, 'public'),
    settings: path.join(__dirname, 'settings')
};

// Создание необходимых папок
Object.values(PATHS).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Состояние приложения
const state = {
    settings: {
        udpSearchEnabled: true,
        logEnabled: false,
        showBytes: false
    },
    converters: new Map()
};

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
            data.forEach(convData => {
                const converter = new Converter(convData);
                state.converters.set(convData.serialNumber, converter);
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
        const data = Array.from(state.converters.values()).map(c => ({
            serialNumber: c.serialNumber,
            ip: c.ip,
            model: c.model,
            version: c.version,
            mode: c.mode,
            L1_Port: c.L1_Port,
            L2_Port: c.L2_Port,
            L1_Conn: c.L1_Conn,
            L2_Conn: c.L2_Conn,
            Lock: c.Lock,
            workingSpeed: c.workingSpeed,
            autoReconnect: c.autoReconnect,
            deleted: c.deleted
        }));
        fs.writeFileSync(convertersFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving converters:', e);
    }
}

// Менеджер конвертеров
const converterManager = {
    addConverter(converter) {
        state.converters.set(converter.serialNumber, converter);
        saveConverters();
        this.notifyListeners();
    },
    
    getConverter(serialNumber) {
        return state.converters.get(serialNumber);
    },
    
    getAllConverters() {
        return Array.from(state.converters.values());
    },
    
    removeConverter(serialNumber) {
        const converter = state.converters.get(serialNumber);
        if (converter) {
            converter.disconnect();
            state.converters.delete(serialNumber);
            saveConverters();
            this.notifyListeners();
            return true;
        }
        return false;
    },
    
    notifyListeners() {
        // Уведомляем всех подписчиков через API
    }
};

// Инициализация модулей
loadSettings();
loadConverters();

const pageGenerator = new PageGenerator(PATHS.pages, PATHS.public);
const converterFinder = new ConverterFinder(converterManager);
const apiModule = new ApiModule({
    converterFinder: converterFinder,
    pageGenerator: pageGenerator,
    state: state,
    saveSettings: saveSettings,
    saveConverters: saveConverters,
    loadSettings: loadSettings,
    loadConverters: loadConverters
});

// Настройка поиска конвертеров
converterFinder.onConverterFound = (converter) => {
    saveConverters();
};

converterFinder.onSearchStatusChanged = (isSearching) => {
    state.settings.udpSearchEnabled = isSearching;
    saveSettings();
};

// Запуск UDP поиска
converterFinder.start();

// === TCP Сервер для клиентов ===
const tcpServer = net.createServer((socket) => {
    const clientAddress = socket.remoteAddress;
    console.log(`TCP клиент подключен: ${clientAddress}`);
    
    // Ищем конвертер по IP
    let converter = null;
    for (const [sn, conv] of state.converters) {
        if (conv.ip === clientAddress && conv.mode === 'client') {
            converter = conv;
            break;
        }
    }
    
    if (!converter) {
        // Новый конвертер в режиме клиента
        const config = {
            ip: clientAddress,
            mode: 'client',
            serialNumber: `SN_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            model: 'Z397-WEB',
            version: 'unknown',
            workingSpeed: 38400,
            autoReconnect: true
        };
        converter = new Converter(config);
        converterManager.addConverter(converter);
    }
    
    // Назначаем сокет конвертеру
    converter.socket = socket;
    converter.connected = true;
    converter.lastSeen = Date.now();
    converter._setupSocketEvents();
    
    // Автоматически переключаем на 230400 для получения информации
    converter.setSpeed(230400)
        .then(() => converter.getInfo())
        .then((info) => {
            if (info.success && info.data && info.data.serialNumber) {
                const oldSn = converter.serialNumber;
                converter.serialNumber = info.data.serialNumber;
                state.converters.delete(oldSn);
                state.converters.set(info.data.serialNumber, converter);
                saveConverters();
            }
            return converter.setSpeed(converter.workingSpeed);
        })
        .catch((error) => {
            console.error(`Ошибка настройки клиента ${clientAddress}:`, error);
        });
    
    socket.on('data', (data) => {
        converter.emit('data', data);
    });
    
    socket.on('close', () => {
        console.log(`TCP клиент отключен: ${clientAddress}`);
        converter.connected = false;
        converter.socket = null;
    });
});

tcpServer.listen(CONFIG.tcpPort, '0.0.0.0', () => {
    console.log(`TCP сервер запущен на порту ${CONFIG.tcpPort}`);
});

// === HTTP Сервер ===
const httpServer = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // API
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
    
    // Главная страница
    if (pathname === '/' || pathname === '/index.html') {
        const indexPath = path.join(PATHS.public, 'index.html');
        if (fs.existsSync(indexPath)) {
            serveFile(indexPath, res);
        } else {
            pageGenerator.generate();
            serveFile(indexPath, res);
        }
        return;
    }
    
    // Страницы
    if (pathname.startsWith('/pages/')) {
        const filePath = path.join(PATHS.pages, pathname.replace('/pages/', ''));
        serveFile(filePath, res);
        return;
    }
    
    // Публичные файлы
    if (pathname.startsWith('/public/')) {
        const filePath = path.join(PATHS.public, pathname.replace('/public/', ''));
        serveFile(filePath, res);
        return;
    }
    
    // 404
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
        case '.jpg':
        case '.jpeg':
            contentType = 'image/jpeg';
            break;
        case '.svg':
            contentType = 'image/svg+xml';
            break;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
}

async function handleApiRequest(data, res) {
    const { api, cmd, data: params } = data;
    
    if (!api || !cmd) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing api or cmd' }));
        return;
    }
    
    try {
        const result = await apiModule.execute(api, cmd, params || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            api: api,
            cmd: cmd,
            result: result
        }));
    } catch (e) {
        console.error(`API Error (${api}.${cmd}):`, e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            api: api,
            cmd: cmd,
            error: e.message
        }));
    }
}

// === Функции для вывода адресов ===
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({
                    address: iface.address,
                    name: name,
                    family: 'IPv4'
                });
            }
        }
    }
    
    return ips;
}

// === Запуск ===
httpServer.listen(CONFIG.httpPort, '0.0.0.0', () => {
    console.log('\n========================================');
    console.log('🚀 Z-397 Конвертер Менеджер');
    console.log('========================================\n');
    
    const ips = getLocalIPs();
    console.log(`🌐 HTTP сервер запущен на порту ${CONFIG.httpPort}`);
    console.log(`🔌 TCP сервер запущен на порту ${CONFIG.tcpPort}`);
    console.log(`📡 UDP поиск запущен на порту ${CONFIG.udpPort}\n`);
    
    console.log('📡 Доступные адреса:');
    if (ips.length === 0) {
        console.log(`  http://localhost:${CONFIG.httpPort}`);
    } else {
        ips.forEach(ip => {
            console.log(`  http://${ip.address}:${CONFIG.httpPort} (${ip.name})`);
        });
        console.log(`  http://localhost:${CONFIG.httpPort} (localhost)`);
    }
    
    console.log('\n📋 API команды:');
    console.log('  converter: list, get, connect, disconnect, delete, setSpeed, getState, updateInfo, sendInfo');
    console.log('  server: status, settings, updateSettings, restart');
    console.log('  controller: list, get, scan (заглушки)');
    console.log('  pageGenerator: generate, list');
    console.log('  admin: getConverters');
    
    console.log('\n========================================');
    console.log('Нажмите Ctrl+C для остановки');
});

// === Генерация главной страницы при запуске ===
pageGenerator.generate();

// === Обработка завершения ===
process.on('SIGINT', () => {
    console.log('\n\n⏹ Остановка приложения...');
    
    converterFinder.stop();
    
    for (const [sn, converter] of state.converters) {
        converter.disconnect();
    }
    
    saveSettings();
    saveConverters();
    
    httpServer.close();
    tcpServer.close();
    
    console.log('✅ Приложение остановлено');
    process.exit(0);
});