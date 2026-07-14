const net = require('net');
const EventEmitter = require('events');

// ============================================
// КОМАНДЫ ПРОТОКОЛА
// ============================================

const Commands = {
    // Команда: запрос информации
    buildGetInfo() {
        return {
            cmd: Buffer.from([0x69, 0x0D]),
            expectedLength: 221,
            timeout: 1500,
            pause: 10
        };
    },

    // Команда: установка скорости
    buildSetSpeed(speed) {
        const speedMap = {
            230400: [0x00, 0x03, 0x84, 0x00],
            115200: [0x00, 0x01, 0xC2, 0x00],
            38400:  [0x00, 0x00, 0x96, 0x00]
        };
        const bytes = speedMap[speed] || speedMap[38400];
        
        return {
            cmd: Buffer.from([0xFF, 0xFA, 0x2C, 0x01, ...bytes, 0xFF, 0xF0]),
            expectedLength: 0,
            timeout: 1000,
            pause: 10
        };
    }
};

// ============================================
// КЛАСС CONVERTER
// ============================================

class Converter extends EventEmitter {
    constructor(config) {
        super();
        
        this.serialNumber = config.serialNumber || null;
        this.ip = config.ip || null;
        this.model = config.model || 'Z397-WEB';
        this.version = config.version || 'unknown';
        this.mode = config.mode || 'server';
        
        this.L1_Port = config.L1_Port || 1000;
        this.L2_Port = config.L2_Port || 1001;
        this.L1_Conn = config.L1_Conn || '0.0.0.0';
        this.L2_Conn = config.L2_Conn || '0.0.0.0';
        
        this.Lock = config.Lock || '0';
        this.connected = false;
        this.busy = false;
        this.busyWith = null;
        this.deleted = false;
        this.lastSeen = Date.now();
        
        this.workingSpeed = config.workingSpeed || 38400;
        this.autoReconnect = config.autoReconnect !== undefined ? config.autoReconnect : true;
        
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this._commandInProgress = false;
    }

    connect() {
        return new Promise((resolve, reject) => {
            if (this.connected && this.socket) {
                resolve(this.socket);
                return;
            }
            
            if (this.deleted) {
                reject(new Error('Конвертер удален'));
                return;
            }
            
            if (this.busy) {
                reject(new Error('Конвертер занят другим приложением'));
                return;
            }
            
            if (this.mode === 'client') {
                reject(new Error('Конвертер в режиме клиента, ожидайте подключения'));
                return;
            }
            
            if (!this.ip) {
                reject(new Error('IP адрес не указан'));
                return;
            }
            
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
                socket.destroy();
                reject(new Error('Таймаут подключения'));
            }, 5000);
            
            socket.connect(parseInt(this.L1_Port), this.ip, async () => {
                clearTimeout(timeout);
                
                this.socket = socket;
                this.connected = true;
                this.reconnectAttempts = 0;
                
                this._setupSocketEvents();
                
                try {
                    // 1. Установка скорости 230400
                    const speedResult = await this._executeCommand(Commands.buildSetSpeed(230400));
                    if (!speedResult.success) {
                        this.disconnect();
                        reject(new Error(`Не удалось установить скорость 230400: ${speedResult.error || speedResult.message}`));
                        return;
                    }
                    
                    // 2. Запрос информации
                    const infoResult = await this._executeCommand(Commands.buildGetInfo());
                    if (!infoResult.success) {
                        this.disconnect();
                        reject(new Error(`Информация не получена: ${infoResult.message || 'таймаут'}`));
                        return;
                    }
                    
                    const info = this._parseInfo(infoResult.data);
                    
                    // 3. Установка рабочей скорости
                    const workSpeedResult = await this._executeCommand(Commands.buildSetSpeed(this.workingSpeed));
                    if (!workSpeedResult.success) {
                        this.disconnect();
                        reject(new Error(`Не удалось установить скорость ${this.workingSpeed}: ${workSpeedResult.error || workSpeedResult.message}`));
                        return;
                    }
                    
                    this.emit('connected', info);
                    resolve(socket);
                } catch (error) {
                    this.disconnect();
                    reject(error);
                }
            });
            
            socket.on('error', (err) => {
                clearTimeout(timeout);
                this.connected = false;
                this.socket = null;
                reject(err);
            });
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.connected = false;
        this.busy = false;
        this.busyWith = null;
        this._commandInProgress = false;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this.emit('disconnected');
    }

    _executeCommand(command) {
        return new Promise((resolve) => {
            if (!this.connected || !this.socket) {
                resolve({ success: false, error: 'Нет соединения' });
                return;
            }
            
            if (this._commandInProgress) {
                resolve({ success: false, error: 'Предыдущая команда еще выполняется' });
                return;
            }
            
            this._commandInProgress = true;
            
            const { cmd, expectedLength, timeout, pause } = command;
            let response = Buffer.alloc(0);
            let resolved = false;
            let timeoutId = null;
            
            // Проверяем буфер от предыдущих команд
            if (this.buffer.length > 0) {
                const data = this.buffer;
                this.buffer = Buffer.alloc(0);
                response = Buffer.concat([response, data]);
                
                if (expectedLength === 0) {
                    this._commandInProgress = false;
                    setTimeout(() => {
                        resolve({ success: true, data: Buffer.alloc(0), timeout: false });
                    }, pause || 0);
                    return;
                }
                
                if (response.length >= expectedLength) {
                    const result = response.slice(0, expectedLength);
                    this.buffer = response.slice(expectedLength);
                    this._commandInProgress = false;
                    setTimeout(() => {
                        resolve({ success: true, data: result, timeout: false });
                    }, pause || 0);
                    return;
                }
            }
            
            // Команда без ответа
            if (expectedLength === 0) {
                this.socket.write(cmd, (err) => {
                    this._commandInProgress = false;
                    if (err) {
                        resolve({ success: false, error: err.message });
                        return;
                    }
                    setTimeout(() => {
                        resolve({ success: true, data: Buffer.alloc(0), timeout: false });
                    }, pause || 0);
                });
                return;
            }
            
            // Команда с ответом
            const onData = (data) => {
                response = Buffer.concat([response, data]);
                
                if (response.length >= expectedLength) {
                    const result = response.slice(0, expectedLength);
                    this.buffer = response.slice(expectedLength);
                    
                    if (this.socket) {
                        this.socket.removeListener('data', onData);
                    }
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    resolved = true;
                    this._commandInProgress = false;
                    
                    setTimeout(() => {
                        resolve({ success: true, data: result, timeout: false });
                    }, pause || 0);
                }
            };
            
            this.socket.on('data', onData);
            
            this.socket.write(cmd, (err) => {
                if (err) {
                    if (this.socket) {
                        this.socket.removeListener('data', onData);
                    }
                    this._commandInProgress = false;
                    resolve({ success: false, error: err.message });
                    return;
                }
            });
            
            // Таймаут — штатное завершение
            timeoutId = setTimeout(() => {
                if (resolved) return;
                
                if (this.socket) {
                    this.socket.removeListener('data', onData);
                }
                this._commandInProgress = false;
                
                if (response.length > 0) {
                    resolve({
                        success: true,
                        data: response,
                        timeout: true,
                        partial: true,
                        message: `Получено ${response.length} байт из ${expectedLength}`
                    });
                } else {
                    resolve({
                        success: false,
                        data: Buffer.alloc(0),
                        timeout: true,
                        message: `Таймаут: ответ не получен за ${timeout}мс`
                    });
                }
            }, timeout || 3000);
        });
    }

    async getInfo() {
        const result = await this._executeCommand(Commands.buildGetInfo());
        if (!result.success) {
            return {
                success: false,
                error: result.message || 'Информация не получена',
                timeout: result.timeout || false
            };
        }
        return {
            success: true,
            data: this._parseInfo(result.data),
            timeout: false
        };
    }

    async setSpeed(speed) {
        const result = await this._executeCommand(Commands.buildSetSpeed(speed));
        if (!result.success) {
            return { success: false, error: result.error || result.message || 'Ошибка установки скорости' };
        }
        this.workingSpeed = speed;
        return { success: true, speed };
    }

    _parseInfo(data) {
        try {
            const str = data.toString('ascii');
            
            const snMatch = str.match(/S\/N:(\d+)/i);
            if (snMatch) {
                this.serialNumber = snMatch[1];
            }
            
            const versionMatch = str.match(/Version\s+([\d.]+)/i);
            if (versionMatch) {
                this.version = versionMatch[1];
            }
            
            const modelMatch = str.match(/Z397-WEB/i);
            if (modelMatch) {
                this.model = 'Z397-WEB';
            }
            
            return {
                raw: str,
                serialNumber: this.serialNumber,
                version: this.version,
                model: this.model
            };
        } catch (e) {
            return { raw: data.toString('hex') };
        }
    }

    _setupSocketEvents() {
        if (!this.socket) return;
        
        this.socket.on('data', (data) => {
            this.buffer = Buffer.concat([this.buffer, data]);
            this.emit('data', data);
        });
        
        this.socket.on('close', () => {
            this.connected = false;
            this.socket = null;
            this._commandInProgress = false;
            this.emit('disconnected');
            
            if (this.autoReconnect && !this.deleted) {
                this._scheduleReconnect();
            }
        });
        
        this.socket.on('error', (err) => {
            this.connected = false;
            this.socket = null;
            this._commandInProgress = false;
            this.emit('error', err);
            
            if (this.autoReconnect && !this.deleted) {
                this._scheduleReconnect();
            }
        });
    }

    _scheduleReconnect() {
        if (this.reconnectTimer) return;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            return;
        }
        
        this.reconnectAttempts++;
        const delay = 2000 * Math.pow(2, this.reconnectAttempts - 1);
        
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.connect();
            } catch (error) {
                this._scheduleReconnect();
            }
        }, delay);
    }

    send(data) {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this.socket) {
                reject(new Error('Нет соединения'));
                return;
            }
            
            this.socket.write(data, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    getState() {
        return {
            serialNumber: this.serialNumber,
            ip: this.ip,
            model: this.model,
            version: this.version,
            mode: this.mode,
            connected: this.connected,
            busy: this.busy,
            busyWith: this.busyWith,
            deleted: this.deleted,
            workingSpeed: this.workingSpeed,
            L1_Port: this.L1_Port,
            L2_Port: this.L2_Port,
            L1_Conn: this.L1_Conn,
            L2_Conn: this.L2_Conn,
            Lock: this.Lock,
            lastSeen: this.lastSeen
        };
    }
}

module.exports = Converter;