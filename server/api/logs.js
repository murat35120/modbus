module.exports = function(deps) {
    return {
        toggleLog: function(params, state) {
            const { enabled } = params;
            if (typeof enabled !== 'boolean') {
                throw new Error('Параметр enabled должен быть boolean');
            }
            
            state.settings.logEnabled = enabled;
            deps.saveSettings();
            
            deps.sendLogEntry({
                timestamp: new Date().toISOString(),
                type: 'info',
                message: enabled ? '✅ Логирование включено' : '⚠️ Логирование отключено'
            });
            
            deps.sendLogSettings({
                logEnabled: enabled,
                showBytes: state.settings.showBytes
            });
            
            return { 
                success: true, 
                message: enabled ? 'Логирование включено' : 'Логирование выключено' 
            };
        },
        
        toggleShowBytes: function(params, state) {
            const { show } = params;
            if (typeof show !== 'boolean') {
                throw new Error('Параметр show должен быть boolean');
            }
            
            state.settings.showBytes = show;
            deps.saveSettings();
            
            deps.sendLogEntry({
                timestamp: new Date().toISOString(),
                type: 'info',
                message: show ? '🔢 Показ байт включен' : '🔢 Показ байт выключен'
            });
            
            deps.sendLogSettings({
                logEnabled: state.settings.logEnabled,
                showBytes: show
            });
            
            return { 
                success: true, 
                message: show ? 'Показ байт включен' : 'Показ байт выключен' 
            };
        },
        
        getSettings: function(params, state) {
            return {
                logEnabled: state.settings.logEnabled,
                showBytes: state.settings.showBytes
            };
        },
        
        logMessage: function(params, state) {
            const { message, type } = params;
            if (!message) {
                throw new Error('Сообщение не указано');
            }
            
            if (state.settings.logEnabled) {
                deps.sendLogEntry({
                    timestamp: new Date().toISOString(),
                    message: message,
                    type: type || 'info'
                });
            }
            
            return { success: true };
        }
    };
};