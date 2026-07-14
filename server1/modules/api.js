class ApiModule {
    constructor(deps) {
        this.deps = deps;
        this.commands = {
            'converter': {
                'list': this.listConverters.bind(this),
                'get': this.getConverter.bind(this),
                'connect': this.connectConverter.bind(this),
                'disconnect': this.disconnectConverter.bind(this),
                'delete': this.deleteConverter.bind(this),
                'setSpeed': this.setConverterSpeed.bind(this),
                'getState': this.getConverterState.bind(this),
                'updateInfo': this.updateConverterInfo.bind(this),
                'sendInfo': this.sendInfo.bind(this)
            },
            'controller': {
                'list': this.listControllers.bind(this),
                'get': this.getController.bind(this),
                'scan': this.scanControllers.bind(this)
            },
            'server': {
                'status': this.getServerStatus.bind(this),
                'settings': this.getSettings.bind(this),
                'updateSettings': this.updateSettings.bind(this),
                'restart': this.restartServer.bind(this)
            },
            'pageGenerator': {
                'generate': this.generatePages.bind(this),
                'list': this.listPages.bind(this)
            },
            'admin': {
                'getConverters': this.getConvertersAdmin.bind(this)
            }
        };
    }
    
    async execute(api, cmd, data) {
        const module = this.commands[api];
        if (!module) {
            throw new Error(`API "${api}" не найден`);
        }
        
        const handler = module[cmd];
        if (!handler) {
            throw new Error(`Команда "${cmd}" не найдена в API "${api}"`);
        }
        
        return await handler(data || {});
    }
    
    // ============================================
    // КОНВЕРТЕРЫ
    // ============================================
    
    listConverters(data) {
        const { converterFinder } = this.deps;
        const converters = converterFinder.getAllConverters();
        return converters.map(c => {
            if (c.getState) {
                return c.getState();
            }
            return c;
        });
    }
    
    getConverter(data) {
        const { converterFinder } = this.deps;
        const { serialNumber } = data;
        if (!serialNumber) {
            throw new Error('Не указан серийный номер');
        }
        const converter = converterFinder.getConverter(serialNumber);
        if (!converter) {
            throw new Error(`Конвертер ${serialNumber} не найден`);
        }
        return converter.getState ? converter.getState() : converter;
    }
    
    async connectConverter(data) {
        const { converterFinder } = this.deps;
        const { serialNumber } = data;
        if (!serialNumber) {
            throw new Error('Не указан серийный номер');
        }
        const converter = converterFinder.getConverter(serialNumber);
        if (!converter) {
            throw new Error(`Конвертер ${serialNumber} не найден`);
        }
        if (converter.deleted) {
            throw new Error(`Конвертер ${serialNumber} удален`);
        }
        await converter.connect();
        return { success: true, serialNumber };
    }
    
    async disconnectConverter(data) {
        const { converterFinder } = this.deps;
        const { serialNumber } = data;
        if (!serialNumber) {
            throw new Error('Не указан серийный номер');
        }
        const converter = converterFinder.getConverter(serialNumber);
        if (!converter) {
            throw new Error(`Конвертер ${serialNumber} не найден`);
        }
        converter.disconnect();
        return { success: true, serialNumber };
    }
    
    async deleteConverter(data) {
        const { converterFinder } = this.deps;
        const { serialNumber } = data;
        if (!serialNumber) {
            throw new Error('Не указан серийный номер');
        }
        const converter = converterFinder.getConverter(serialNumber);
        if (!converter) {
            throw new Error(`Конвертер ${serialNumber} не найден`);
        }
        converter.deleted = true;
        converter.disconnect();
        return { success: true, serialNumber, deleted: true };
    }
    
    async setConverterSpeed(data) {
        const { converterFinder } = this.deps;
        const { serialNumber, speed } = data;
        if (!serialNumber || !speed) {
            throw new Error('Не указан серийный номер или скорость');
        }
        const converter = converterFinder.getConverter(serialNumber);
        if (!converter) {
            throw new Error(`Конвертер ${serialNumber} не найден`);
        }
        const result = await converter.setSpeed(speed);
        if (!result.success) {
            throw new Error(result.error || 'Ошибка установки скорости');
        }
        return { success: true, serialNumber, speed };
    }
    
    async getConverterState(data) {
        const { converterFinder } = this.deps;
        const { serialNumber } = data;
        if (!serialNumber) {
            throw new Error('Не указан серийный номер');
        }
        const converter = converterFinder.getConverter(serialNumber);
        if (!converter) {
            throw new Error(`Конвертер ${serialNumber} не найден`);
        }
        return converter.getState ? converter.getState() : converter;
    }
    
    async updateConverterInfo(data) {
        const { converterFinder } = this.deps;
        const { serialNumber } = data;
        if (!serialNumber) {
            throw new Error('Не указан серийный номер');
        }
        const converter = converterFinder.getConverter(serialNumber);
        if (!converter) {
            throw new Error(`Конвертер ${serialNumber} не найден`);
        }
        if (!converter.connected) {
            await converter.connect();
        }
        const result = await converter.getInfo();
        if (!result.success) {
            throw new Error(result.error || 'Не удалось получить информацию');
        }
        return { success: true, serialNumber, info: result.data };
    }
    
    async sendInfo(data) {
        const { converterFinder } = this.deps;
        const { serialNumber } = data;
        if (!serialNumber) {
            throw new Error('Не указан серийный номер');
        }
        const converter = converterFinder.getConverter(serialNumber);
        if (!converter) {
            throw new Error(`Конвертер ${serialNumber} не найден`);
        }
        if (!converter.connected) {
            throw new Error('Конвертер не подключен');
        }
        const result = await converter.getInfo();
        if (!result.success) {
            throw new Error(result.error || 'Информация не получена');
        }
        return result.data;
    }
    
    // ============================================
    // КОНТРОЛЛЕРЫ (заглушки)
    // ============================================
    
    listControllers(data) {
        return { controllers: [], message: 'Функция будет реализована позже' };
    }
    
    getController(data) {
        return { controller: null, message: 'Функция будет реализована позже' };
    }
    
    scanControllers(data) {
        return { success: true, message: 'Функция будет реализована позже' };
    }
    
    // ============================================
    // СЕРВЕР
    // ============================================
    
    getServerStatus(data) {
        const { converterFinder } = this.deps;
        return {
            status: 'running',
            udpSearch: converterFinder.getStatus(),
            convertersCount: converterFinder.getAllConverters().length,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
    }
    
    getSettings(data) {
        const { state } = this.deps;
        return state.settings || {};
    }
    
    updateSettings(data) {
        const { state, saveSettings } = this.deps;
        state.settings = { ...(state.settings || {}), ...data };
        if (saveSettings) saveSettings();
        return state.settings;
    }
    
    async restartServer(data) {
        setTimeout(() => {
            process.exit(0);
        }, 1000);
        return { success: true, message: 'Сервер перезапускается...' };
    }
    
    // ============================================
    // ГЕНЕРАТОР СТРАНИЦ
    // ============================================
    
    generatePages(data) {
        const { pageGenerator } = this.deps;
        if (!pageGenerator) {
            throw new Error('PageGenerator не найден');
        }
        const pages = pageGenerator.generate();
        return {
            success: true,
            pages: pages,
            count: pages.length,
            message: `Сгенерировано ${pages.length} страниц`
        };
    }
    
    listPages(data) {
        const { pageGenerator } = this.deps;
        if (!pageGenerator) {
            throw new Error('PageGenerator не найден');
        }
        return {
            success: true,
            pages: pageGenerator.getPages(),
            count: pageGenerator.getPages().length
        };
    }
    
    // ============================================
    // ADMIN
    // ============================================
    
    getConvertersAdmin(data) {
        const { converterFinder } = this.deps;
        const converters = converterFinder.getAllConverters();
        return converters.map(c => {
            if (c.getState) {
                return c.getState();
            }
            return c;
        });
    }
}

module.exports = ApiModule;