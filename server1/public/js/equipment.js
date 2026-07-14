/**
 * Страница "Оборудование"
 * Управление конвертерами Z-397
 */

// Состояние
let state = {
    converters: [],
    selectedSn: null,
    selectedConverter: null,
    isConnected: false,
    udpEnabled: true
};

// ============================================
// ЗАГРУЗКА СПИСКА КОНВЕРТЕРОВ
// ============================================

async function loadConverters() {
    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api: 'converter',
                cmd: 'list',
                data: {}
            })
        });
        const data = await response.json();
        
        if (data.success) {
            state.converters = data.result || [];
            renderLists();
            
            if (state.selectedSn) {
                const found = state.converters.find(c => c.serialNumber === state.selectedSn);
                if (found) {
                    state.selectedConverter = found;
                    updateInfoPanel(found);
                } else {
                    state.selectedSn = null;
                    state.selectedConverter = null;
                    clearInfoPanel();
                }
            }
            
            if (!state.selectedSn && state.converters.length > 0) {
                selectConverter(state.converters[0].serialNumber);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки конвертеров:', error);
    }
}

// ============================================
// ОТРИСОВКА СПИСКОВ
// ============================================

function renderLists() {
    const serverConverters = state.converters.filter(c => c.mode === 'server');
    const clientConverters = state.converters.filter(c => c.mode === 'client');
    
    document.getElementById('serverTitle').textContent = `📡 Серверы (${serverConverters.length})`;
    document.getElementById('clientTitle').textContent = `🔄 Клиенты (${clientConverters.length})`;
    
    renderConverterList('serverList', serverConverters);
    renderConverterList('clientList', clientConverters);
}

function renderConverterList(containerId, converters) {
    const container = document.getElementById(containerId);
    
    if (converters.length === 0) {
        container.innerHTML = `<div class="list-empty">Нет конвертеров</div>`;
        return;
    }
    
    container.innerHTML = converters.map(c => {
        const selected = state.selectedSn === c.serialNumber ? 'selected' : '';
        
        let badges = '';
        
        if (c.connected) {
            badges += `<span class="badge badge-connected">● Подключен</span>`;
        } else {
            badges += `<span class="badge badge-disconnected">○ Отключен</span>`;
        }
        
        if (c.busy) {
            badges += `<span class="badge badge-busy">🔒 Занят</span>`;
        }
        
        if (c.mode === 'server') {
            badges += `<span class="badge badge-server">📡 Сервер</span>`;
        } else {
            badges += `<span class="badge badge-client">🔄 Клиент</span>`;
        }
        
        return `
            <div class="list-item ${selected}" 
                 onclick="selectConverter('${c.serialNumber}')"
                 data-sn="${c.serialNumber}">
                <div class="name">${c.model || 'Z397-WEB'} ${c.serialNumber}</div>
                <div class="sub">${c.ip || '—'}</div>
                <div class="badges">${badges}</div>
            </div>
        `;
    }).join('');
}

// ============================================
// ВЫБОР КОНВЕРТЕРА
// ============================================

function selectConverter(serialNumber) {
    state.selectedSn = serialNumber;
    state.selectedConverter = state.converters.find(c => c.serialNumber === serialNumber);
    
    if (state.selectedConverter) {
        updateInfoPanel(state.selectedConverter);
        renderLists();
    }
}

// ============================================
// ОБНОВЛЕНИЕ ПАНЕЛИ ИНФОРМАЦИИ
// ============================================

function updateInfoPanel(converter) {
    if (!converter) return;
    
    document.getElementById('infoTitle').textContent = `${converter.model || 'Z397-WEB'} ${converter.serialNumber}`;
    document.getElementById('infoSubtitle').textContent = converter.ip || '—';
    
    const badge = document.getElementById('statusBadge');
    if (converter.connected) {
        badge.textContent = '● Подключен';
        badge.className = 'badge badge-connected';
    } else if (converter.busy) {
        badge.textContent = '🔒 Занят';
        badge.className = 'badge badge-busy';
    } else {
        badge.textContent = '○ Отключен';
        badge.className = 'badge badge-disconnected';
    }
    
    document.getElementById('snValue').textContent = converter.serialNumber || '—';
    document.getElementById('ipValue').textContent = converter.ip || '—';
    document.getElementById('versionValue').textContent = converter.version || '—';
    document.getElementById('modeValue').textContent = converter.mode === 'server' ? 'Сервер' : 'Клиент';
    document.getElementById('l1PortValue').textContent = converter.L1_Port || '—';
    document.getElementById('l2PortValue').textContent = converter.L2_Port || '—';
    document.getElementById('l1ConnValue').textContent = converter.L1_Conn || '—';
    document.getElementById('l2ConnValue').textContent = converter.L2_Conn || '—';
    document.getElementById('lockValue').textContent = converter.Lock || '0';
    document.getElementById('lastSeenValue').textContent = converter.lastSeen ? new Date(converter.lastSeen).toLocaleString() : '—';
    
    document.getElementById('speedSelect').value = converter.workingSpeed || 38400;
    
    const connectBtn = document.getElementById('connectBtn');
    state.isConnected = converter.connected;
    
    if (converter.connected) {
        connectBtn.textContent = 'Отключить';
        connectBtn.className = 'btn btn-danger';
        connectBtn.disabled = false;
    } else if (converter.busy) {
        connectBtn.textContent = '🔒 Занят';
        connectBtn.className = 'btn btn-outline';
        connectBtn.disabled = true;
    } else {
        connectBtn.textContent = 'Подключить';
        connectBtn.className = 'btn btn-success';
        connectBtn.disabled = false;
    }
    
    updateControllerList(converter);
}

function clearInfoPanel() {
    document.getElementById('infoTitle').textContent = 'Выберите конвертер';
    document.getElementById('infoSubtitle').textContent = 'Нажмите на конвертер в списке слева';
    document.getElementById('statusBadge').textContent = '● Отключен';
    document.getElementById('statusBadge').className = 'badge badge-disconnected';
    
    ['snValue', 'ipValue', 'versionValue', 'modeValue', 'l1PortValue', 
     'l2PortValue', 'l1ConnValue', 'l2ConnValue', 'lockValue', 'lastSeenValue']
        .forEach(id => document.getElementById(id).textContent = '—');
    
    document.getElementById('connectBtn').textContent = 'Подключить';
    document.getElementById('connectBtn').className = 'btn btn-success';
    document.getElementById('connectBtn').disabled = false;
}

// ============================================
// КОНТРОЛЛЕРЫ
// ============================================

function updateControllerList(converter) {
    const container = document.getElementById('controllerList');
    
    if (converter.connected) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="icon">🔍</span>
                Сканирование контроллеров...
                <br><br>
                <button class="btn btn-primary" onclick="scanControllers()">
                    Начать сканирование
                </button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="empty-state">
                <span class="icon">📡</span>
                Подключитесь к конвертеру<br>для сканирования контроллеров
            </div>
        `;
    }
}

async function scanControllers() {
    if (!state.selectedSn) {
        alert('Выберите конвертер');
        return;
    }
    
    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api: 'controller',
                cmd: 'scan',
                data: { serialNumber: state.selectedSn }
            })
        });
        const data = await response.json();
        console.log('Результат сканирования:', data);
    } catch (error) {
        console.error('Ошибка сканирования:', error);
    }
}

// ============================================
// УПРАВЛЕНИЕ
// ============================================

async function toggleUdp() {
    const btn = document.getElementById('udpToggle');
    const isActive = btn.classList.contains('active');
    const newState = !isActive;
    
    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api: 'server',
                cmd: 'updateSettings',
                data: { udpSearchEnabled: newState }
            })
        });
        const data = await response.json();
        
        if (data.success) {
            state.udpEnabled = newState;
            btn.classList.toggle('active');
            btn.classList.toggle('inactive');
            btn.textContent = `Поиск: ${newState ? 'Вкл' : 'Выкл'}`;
        }
    } catch (error) {
        console.error('Ошибка переключения UDP:', error);
    }
}

async function applySpeed() {
    if (!state.selectedSn) {
        alert('Выберите конвертер');
        return;
    }
    
    const speed = parseInt(document.getElementById('speedSelect').value);
    
    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api: 'converter',
                cmd: 'setSpeed',
                data: { serialNumber: state.selectedSn, speed: speed }
            })
        });
        const data = await response.json();
        
        if (data.success) {
            await loadConverters();
            if (state.selectedSn) {
                selectConverter(state.selectedSn);
            }
        }
    } catch (error) {
        console.error('Ошибка применения скорости:', error);
        alert('Ошибка применения скорости');
    }
}

async function toggleConnection() {
    if (!state.selectedSn) {
        alert('Выберите конвертер');
        return;
    }
    
    const cmd = state.isConnected ? 'disconnect' : 'connect';
    
    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api: 'converter',
                cmd: cmd,
                data: { serialNumber: state.selectedSn }
            })
        });
        const data = await response.json();
        
        if (data.success) {
            await loadConverters();
            if (state.selectedSn) {
                selectConverter(state.selectedSn);
            }
        }
    } catch (error) {
        console.error('Ошибка переключения соединения:', error);
        alert('Ошибка переключения соединения');
    }
}

async function refreshInfo() {
    if (!state.selectedSn) {
        alert('Выберите конвертер');
        return;
    }
    
    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api: 'converter',
                cmd: 'updateInfo',
                data: { serialNumber: state.selectedSn }
            })
        });
        const data = await response.json();
        
        if (data.success) {
            await loadConverters();
            if (state.selectedSn) {
                selectConverter(state.selectedSn);
            }
        }
    } catch (error) {
        console.error('Ошибка обновления:', error);
        alert('Ошибка обновления информации');
    }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadConverters();
});

document.addEventListener('DOMContentLoaded', () => {
    const panelHeader = document.querySelector('.panel-left .panel-header');
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-outline';
    refreshBtn.textContent = '🔄';
    refreshBtn.style.padding = '4px 10px';
    refreshBtn.style.fontSize = '14px';
    refreshBtn.onclick = loadConverters;
    refreshBtn.title = 'Обновить список';
    panelHeader.appendChild(refreshBtn);
});