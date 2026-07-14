module.exports = function(deps) {
    return {
        getConverters: function(params, state) {
            return Array.from(state.converters.values());
        },
        
        connect: async function(params, state) {
            const { ip } = params;
            if (!ip) {
                throw new Error('IP адрес не указан');
            }
            
            try {
                await deps.connectToConverter(ip);
                const converter = state.converters.get(ip);
                if (converter) {
                    converter.autoReconnect = true;
                    converter.deleted = false;
                    state.converters.set(ip, converter);
                    state.settings.selectedConverters[ip] = {
                        speed: converter.speed,
                        autoReconnect: true
                    };
                    deps.saveSettings();
                    deps.saveConverters();
                }
                deps.updateConvertersList();
                return { success: true, message: 'Подключено успешно' };
            } catch (e) {
                throw new Error('Ошибка подключения: ' + e.message);
            }
        },
        
        disconnect: async function(params, state) {
            const { ip } = params;
            if (!ip) {
                throw new Error('IP адрес не указан');
            }
            
            try {
                await deps.disconnectFromConverter(ip);
                const converter = state.converters.get(ip);
                if (converter) {
                    converter.autoReconnect = false;
                    state.converters.set(ip, converter);
                    if (state.settings.selectedConverters[ip]) {
                        state.settings.selectedConverters[ip].autoReconnect = false;
                    }
                    deps.saveSettings();
                    deps.saveConverters();
                }
                deps.updateConvertersList();
                return { success: true, message: 'Отключено успешно' };
            } catch (e) {
                throw new Error('Ошибка отключения: ' + e.message);
            }
        },
        
        setSpeed: async function(params, state) {
            const { ip, speed } = params;
            if (!ip || !speed) {
                throw new Error('IP адрес и скорость должны быть указаны');
            }
            
            const converter = state.converters.get(ip);
            if (!converter) {
                throw new Error('Конвертер не найден');
            }
            
            try {
                await deps.setConverterSpeed(ip, speed);
                converter.speed = speed;
                state.converters.set(ip, converter);
                if (!state.settings.selectedConverters[ip]) {
                    state.settings.selectedConverters[ip] = {};
                }
                state.settings.selectedConverters[ip].speed = speed;
                deps.saveSettings();
                deps.saveConverters();
                deps.updateConvertersList();
                return { success: true, message: 'Скорость установлена: ' + speed };
            } catch (e) {
                throw new Error('Ошибка установки скорости: ' + e.message);
            }
        },
        
        getInfo: async function(params, state) {
            const { ip } = params;
            if (!ip) {
                throw new Error('IP адрес не указан');
            }
            
            try {
                const response = await deps.getConverterInfo(ip);
                return { 
                    success: true, 
                    data: response ? response.toString('hex') : 'Нет ответа',
                    message: 'Информация получена' 
                };
            } catch (e) {
                throw new Error('Ошибка получения информации: ' + e.message);
            }
        },
        
        deleteConverter: function(params, state) {
            const { ip } = params;
            if (!ip) {
                throw new Error('IP адрес не указан');
            }
            
            const converter = state.converters.get(ip);
            if (converter) {
                converter.deleted = true;
                converter.autoReconnect = false;
                state.converters.set(ip, converter);
                
                if (state.settings.selectedConverters[ip]) {
                    state.settings.selectedConverters[ip].autoReconnect = false;
                }
                
                if (state.activeConnections.has(ip)) {
                    deps.disconnectFromConverter(ip);
                }
                
                deps.saveSettings();
                deps.saveConverters();
                deps.updateConvertersList();
                
                return { success: true, message: 'Конвертер удален' };
            }
            
            throw new Error('Конвертер не найден');
        },
        
        toggleUdpSearch: function(params, state) {
            const { enabled } = params;
            if (typeof enabled !== 'boolean') {
                throw new Error('Параметр enabled должен быть boolean');
            }
            
            state.settings.udpSearchEnabled = enabled;
            deps.saveSettings();
            
            if (enabled) {
                deps.startUdpSearch();
            } else {
                deps.stopUdpSearch();
            }
            
            return { 
                success: true, 
                message: enabled ? 'UDP поиск включен' : 'UDP поиск выключен' 
            };
        }
    };
};