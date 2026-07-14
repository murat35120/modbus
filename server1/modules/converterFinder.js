const dgram = require('dgram');
const os = require('os');
const Converter = require('./converter');

class ConverterFinder {
    constructor(converterManager) {
        this.converterManager = converterManager;
        this.udpServer = dgram.createSocket('udp4');
        this.isSearching = false;
        this.searchInterval = null;
        this.port = 9000;
        this.broadcastAddr = '255.255.255.255';
        this.converters = new Map();
        this.onConverterFound = null;
        this.onSearchStatusChanged = null;
    }
    
    start() {
        if (this.isSearching) return;
        
        this.udpServer.bind(this.port, () => {
            this.udpServer.setBroadcast(true);
        });
        
        this.udpServer.on('message', (message, rinfo) => {
            this._handleUdpMessage(message, rinfo);
        });
        
        this.isSearching = true;
        this._startSearchInterval();
        
        if (this.onSearchStatusChanged) {
            this.onSearchStatusChanged(true);
        }
    }
    
    stop() {
        this.isSearching = false;
        
        if (this.searchInterval) {
            clearInterval(this.searchInterval);
            this.searchInterval = null;
        }
        
        this.udpServer.close();
        
        if (this.onSearchStatusChanged) {
            this.onSearchStatusChanged(false);
        }
    }
    
    _sendSearchRequest() {
        const message = Buffer.from("SEEK Z397IP");
        this.udpServer.send(
            message,
            0,
            message.length,
            this.port,
            this.broadcastAddr,
            (err) => {
                if (err) {
                    console.error('UDP send error:', err);
                }
            }
        );
    }
    
    _handleUdpMessage(message, rinfo) {
        try {
            const str = message.toString();
            const parsed = this._parseUdpMessage(str, rinfo.address);
            
            if (!parsed || !parsed.serialNumber) return;
            
            const serialNumber = parsed.serialNumber;
            let converter = this.converters.get(serialNumber);
            
            if (converter) {
                converter.ip = parsed.ip;
                converter.model = parsed.model || converter.model;
                converter.version = parsed.version || converter.version;
                converter.L1_Port = parsed.L1_Port || converter.L1_Port;
                converter.L2_Port = parsed.L2_Port || converter.L2_Port;
                converter.L1_Conn = parsed.L1_Conn || converter.L1_Conn;
                converter.L2_Conn = parsed.L2_Conn || converter.L2_Conn;
                converter.Lock = parsed.Lock || converter.Lock;
                converter.mode = parsed.mode || converter.mode;
                converter.lastSeen = Date.now();
                this._updateBusyStatus(converter);
            } else {
                const config = {
                    serialNumber: serialNumber,
                    ip: parsed.ip,
                    model: parsed.model || 'Z397-WEB',
                    version: parsed.version || 'unknown',
                    mode: parsed.mode || 'server',
                    L1_Port: parsed.L1_Port || 1000,
                    L2_Port: parsed.L2_Port || 1001,
                    L1_Conn: parsed.L1_Conn || '0.0.0.0',
                    L2_Conn: parsed.L2_Conn || '0.0.0.0',
                    Lock: parsed.Lock || '0',
                    workingSpeed: 38400,
                    autoReconnect: true
                };
                
                converter = new Converter(config);
                converter.lastSeen = Date.now();
                this._updateBusyStatus(converter);
                this.converterManager.addConverter(converter);
                this.converters.set(serialNumber, converter);
            }
            
            if (this.onConverterFound) {
                this.onConverterFound(converter);
            }
            
        } catch (e) {
            console.error('Error processing UDP message:', e);
        }
    }
    
    _parseUdpMessage(str, ip) {
        const arr = str.split(' ');
        const msg = { ip: ip };
        
        for (let item of arr) {
            const parts = item.split(':');
            if (parts.length > 1) {
                const key = parts[0];
                const value = parts.slice(1).join(':');
                msg[key] = value;
            } else if (item.includes('SN')) {
                const snIndex = item.indexOf('SN');
                msg.serialNumber = item.slice(snIndex + 2);
                if (msg.serialNumber) {
                    const snMatch = msg.serialNumber.match(/^([A-Z0-9]+)/);
                    if (snMatch) {
                        msg.serialNumber = snMatch[1];
                    }
                }
            }
        }
        
        if (msg['Z397WEB-VCP-SW']) {
            const parts = msg['Z397WEB-VCP-SW'].split('-');
            if (parts.includes('VCP')) {
                msg.mode = 'server';
            }
        }
        
        return msg;
    }
    
    _updateBusyStatus(converter) {
        const localIPs = this._getLocalIPs();
        
        const isOurConnection1 = localIPs.includes(converter.L1_Conn);
        const isOurConnection2 = localIPs.includes(converter.L2_Conn);
        
        if (converter.L1_Conn !== '0.0.0.0' && !isOurConnection1) {
            converter.busy = true;
            converter.busyWith = converter.L1_Conn;
        } else if (converter.L2_Conn !== '0.0.0.0' && !isOurConnection2) {
            converter.busy = true;
            converter.busyWith = converter.L2_Conn;
        } else {
            converter.busy = false;
            converter.busyWith = null;
        }
    }
    
    _getLocalIPs() {
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
    
    _startSearchInterval() {
        if (this.searchInterval) {
            clearInterval(this.searchInterval);
        }
        
        this._sendSearchRequest();
        
        this.searchInterval = setInterval(() => {
            if (this.isSearching) {
                this._sendSearchRequest();
            }
        }, 3000);
    }
    
    removeConverter(serialNumber) {
        const converter = this.converters.get(serialNumber);
        if (converter) {
            converter.disconnect();
            this.converters.delete(serialNumber);
            return true;
        }
        return false;
    }
    
    getAllConverters() {
        return Array.from(this.converters.values());
    }
    
    getConverter(serialNumber) {
        return this.converters.get(serialNumber);
    }
    
    getStatus() {
        return this.isSearching;
    }
}

module.exports = ConverterFinder;