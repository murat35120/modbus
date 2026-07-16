// ============================================================
// index.js — СЕРВЕР УПРАВЛЕНИЯ СКУД v3.0.2
// ============================================================

const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const net = require('net');
const dgram = require('dgram');
const { exec } = require('child_process');
const Zip = require('adm-zip');

// ============================================================
// КОНСТАНТЫ
// ============================================================
const port = 25000;
const port_client = 1000;
const port_http = 8080;
const port_ws = 9090;
const port_udp = 9000;
const broadcast_adr = "255.255.255.255";
const folder = "site";
const api_key = '1356_api';

console.log('========================================');
console.log('🚀 СЕРВЕР УПРАВЛЕНИЯ СКУД v3.0.2');
console.log('========================================');

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПАПОК
// ============================================================
const dataFolders = ['stands', 'diagrams', 'tests', 'checks', 'groups', 'results', 'test_sessions', 'diagrams/files'];
dataFolders.forEach(folderName => {
    const folderPath = path.join(__dirname, folderName);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`📁 Создана папка: ${folderName}`);
    }
});

// ============================================================
// РАСПАКОВКА RESOURCES
// ============================================================
if (fs.existsSync("resources.zip")) {
    const zip = new Zip("resources.zip");
    zip.extractAllTo(__dirname, false);
    console.log('📦 Распакованы ресурсы');
}

// ============================================================
// ПОЛУЧЕНИЕ IP АДРЕСА
// ============================================================
let host = '10.4.9.117';
const ip_adresses = os.networkInterfaces();
for (const i in ip_adresses) {
    for (const k in ip_adresses[i]) {
        if (ip_adresses[i][k].family == 'IPv4') {
            if (ip_adresses[i][k].address != "127.0.0.1") {
                host = ip_adresses[i][k].address;
                console.log(`🌐 HTTP Server: http://${host}:${port_http}`);
                console.log(`🌐 WS Server: ws://${host}:${port_ws}`);
            }
        }
    }
}

// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let converters = [];
let controllers = {};
let cards = {};
let list_cl = {};
let wsClientId = 0;
const admins = new Map();

// ============================================================
// ФУНКЦИЯ CRC16
// ============================================================
function getCRC(buffer) {
    let crc = new Uint16Array([0xffff]);
    let n = buffer.byteLength;
    for (let j = 0; j < n; j++) {
        crc = crc ^= Number(buffer[j]);
        for (let i = 0; i < 8; i++) {
            if (crc & 1) {
                crc >>= 1;
                crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return new Uint8Array(new Uint16Array([crc]).buffer);
}

function buff_sum(arr) {
    let lng_all = 0;
    for (let i = 0; i < arr.length; i++) {
        lng_all = lng_all + arr[i].byteLength;
    }
    let bfull = new Uint8Array(lng_all);
    let offset = 0;
    for (let i = 0; i < arr.length; i++) {
        bfull.set(arr[i], offset);
        offset = offset + arr[i].byteLength;
    }
    return bfull;
}

// ============================================================
// КЛАСС CONVERTER
// ============================================================
class Converter {
    constructor(socket, msg) {
        this.socket = socket;
        this.q_fast = [];
        this.i_fast = -1;
        this.q_main = [];
        this.i_main = -1;
        this.survey = '';
        this.finding = '';
        this.scan_count = 5;
        this.scan_controllers = 10;
        this.scan_current = 0;
        this.pause = 5;
        this.wait = 200;
        this.timer = null;
        this.count = 0;
        this.number = msg.number;
        this.version = msg.version;
        this.model = msg.model;
        this.type = "fast";
        this.current = '';
        this.addresses = {};
        this.connected = true;
        this.test = +new Date();
        this.pk = 0;
        this.answer_length = [0, 13, 0, 0, 17, 0, 8];
        this.count_out = 0;
        this.count_in = 0;
        this.last_answer = +(new Date());
    }

    add(q_type, data, receiver = func_api.survey_receiver, callback = '') {
        let obj = { data: data, receiver: receiver, callback: callback };
        let start = 0;
        if (this.i_fast == -1 && this.i_main == -1) {
            start = 1;
        }
        this[q_type].push(obj);
        if (start) {
            this.next();
        }
    }

    next() {
        if (this.i_fast < this.q_fast.length - 1) {
            step("fast", this);
        } else {
            this.i_fast = -1;
            this.q_fast = [];
            if (this.i_main < this.q_main.length - 1) {
                step("main", this);
            } else {
                this.i_main = -1;
                this.q_main = [];
                if (this.connected) {
                    func_api.survey_make(this);
                }
            }
        }

        function step(type, thet) {
            let i = "i_" + type;
            let q = "q_" + type;
            thet[i]++;
            thet.type = type;
            thet.current = thet[q][thet[i]];
            if (thet.current) {
                thet.socket.write(thet.current.data);
                thet.timer = setTimeout(() => {
                    clearTimeout(thet.timer);
                    thet.current.receiver(thet, thet.current.data, false);
                    thet.next();
                }, thet.wait);
            }
        }
    }

    listener(data) {
        let msg = data.subarray(0, data.length - 2);
        let dd = getCRC(msg);
        if (data.length >= this.answer_length[data[1]]) {
            let check = 1;
            for (let j = 0; j < 1; j++) {
                if (+this.current.data[j] != +data[j]) {
                    check = 0;
                }
            }
            if (check) {
                clearTimeout(this.timer);
                this.current.receiver(this, data, true);
                setTimeout(() => this.next(), this.pause);
            }
        }
    }
}

// ============================================================
// КЛАСС CONTROLLER
// ============================================================
class Controller {
    constructor(type, number, converter, address) {
        this.converter = converter;
        this.converter_count = converter.count;
        this.address = address;
        this.type = type;
        this.number = number;
        this.active = true;
        this.request = '';
        this.triggers = [];
        this.pattern = {};
        this.data = null;
        this.bit_for_out = 4;
        this.bit_for_in = 2;
        this.time_open_s = 3;
        this.time_open_m = 5;
    }

    add_trigger(trigger_set) {
        let trigger_id;
        let obj_trg = {};
        if (trigger_set.type in func_api.types) {
            for (let item in func_api.types[trigger_set.type]) {
                obj_trg[item] = func_api.types[trigger_set.type][item];
            }
            for (let j in trigger_set) {
                obj_trg[j] = trigger_set[j];
            }
            obj_trg.temp = false;
            trigger_id = this.triggers.push(obj_trg) - 1;
        }
        this.make_patern();
        return trigger_id;
    }

    make_patern() {
        this.pattern = {};
        for (let i = 0; i < this.triggers.length; i++) {
            if (!this.triggers[i].min) {
                if (this.triggers[i].byte_num in this.pattern) {
                    if (this.triggers[i].bits in this.pattern[this.triggers[i].byte_num].bits) {
                        if (String(this.triggers[i].sost) in this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost) {
                            this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost[this.triggers[i].sost].push(this.triggers[i].callback);
                        } else {
                            this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost[this.triggers[i].sost] = [this.triggers[i].callback];
                        }
                    } else {
                        this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits] = { type: this.triggers[i].type, sost: {} };
                        this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost[this.triggers[i].sost] = [this.triggers[i].callback];
                    }
                } else {
                    this.pattern[this.triggers[i].byte_num] = { for_all: 0, bits: {}, temp: 0 };
                    this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits] = { type: this.triggers[i].type, sost: {} };
                    this.pattern[this.triggers[i].byte_num].bits[this.triggers[i].bits].sost[this.triggers[i].sost] = [this.triggers[i].callback];
                }
            } else {
                if (this.triggers[i].byte_num in this.pattern) {
                    if (this.pattern[this.triggers[i].byte_num].a) {
                        this.pattern[this.triggers[i].byte_num].a.push(this.triggers[i]);
                    } else {
                        this.pattern[this.triggers[i].byte_num].a = [this.triggers[i]];
                    }
                } else {
                    this.pattern[this.triggers[i].byte_num] = { a: [this.triggers[i]] };
                }
            }
        }
        for (let byte_num in this.pattern) {
            if (this.pattern[byte_num].bits) {
                let for_all = 0;
                for (let bits in this.pattern[byte_num].bits) {
                    for_all = (+for_all) | (+bits);
                }
                this.pattern[byte_num].for_all = for_all;
            }
        }
    }

    dell_trigger(trigger_id) {
        this.triggers.splice(trigger_id, 1);
        this.make_patern();
    }

    trigger(data) {
        if (data[1] == 4) {
            this.data = data;
            for (let byte_num in this.pattern) {
                if (this.pattern[byte_num].bits) {
                    let temp_data = (+data[byte_num]) & (+this.pattern[byte_num].for_all);
                    if (temp_data != this.pattern[byte_num].temp) {
                        for (let bits in this.pattern[byte_num].bits) {
                            if (+(temp_data & bits) != +(this.pattern[byte_num].temp & bits)) {
                                for (let sost in this.pattern[byte_num].bits[bits].sost) {
                                    if (temp_data == sost) {
                                        for (let cb = 0; cb < this.pattern[byte_num].bits[bits].sost[sost].length; cb++) {
                                            this.trigger_info = {
                                                api: 'trigger_info',
                                                controller: this.type + '_' + this.number,
                                                name: func_api.type_info[byte_num][bits],
                                                sost: sost
                                            };
                                            this.pattern[byte_num].bits[bits].sost[sost][cb](this);
                                        }
                                    }
                                }
                            }
                        }
                        this.pattern[byte_num].temp = temp_data;
                    }
                }
                if (this.pattern[byte_num].a) {
                    let val = (+data[byte_num]);
                    for (let k = 0; k < this.pattern[byte_num].a.length; k++) {
                        if ((val < this.pattern[byte_num].a[k].min - this.pattern[byte_num].a[k].dev) ||
                            (val > this.pattern[byte_num].a[k].max + this.pattern[byte_num].a[k].dev)) {
                            if (this.pattern[byte_num].a[k].temp) {
                                this.pattern[byte_num].a[k].temp = false;
                            }
                        }
                        if ((val > (+this.pattern[byte_num].a[k].min) + (+this.pattern[byte_num].a[k].dev)) &&
                            (val < (+this.pattern[byte_num].a[k].max) - (+this.pattern[byte_num].a[k].dev))) {
                            if (!this.pattern[byte_num].a[k].temp) {
                                this.pattern[byte_num].a[k].temp = true;
                                this.trigger_info = {
                                    api: 'trigger_info',
                                    controller: this.type + '_' + this.number,
                                    name: func_api.type_info[byte_num],
                                    a: this.pattern[byte_num].a[k]
                                };
                                this.pattern[byte_num].a[k].callback(this);
                            }
                        }
                    }
                }
            }
        }
    }

    open_for_out(thet = this) {
        func_api.output(thet, thet.bit_for_out, thet.time_open_s, thet.time_open_m);
        func_api.output(thet, 3, 0, 125);
    }

    closed_for_out(thet = this) {
        func_api.output(thet, thet.bit_for_out, 0, 1);
        func_api.output(thet, 3, 0, 1);
    }

    open_for_in(thet = this) {
        func_api.output(thet, thet.bit_for_in, thet.time_open_s, thet.time_open_m);
        func_api.output(thet, 3, thet.time_open_s, thet.time_open_m);
    }

    closed_for_in(thet = this) {
        func_api.output(thet, thet.bit_for_in, 0, 1);
        func_api.output(thet, 3, 0, 1);
    }
}

// ============================================================
// ФУНКЦИИ РАБОТЫ С ФАЙЛАМИ (CRUD)
// ============================================================
function fileOperations() {
    const basePath = __dirname;

    function getList(folder) {
        const folderPath = path.join(basePath, folder);
        if (!fs.existsSync(folderPath)) return [];
        const files = fs.readdirSync(folderPath);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const fullPath = path.join(folderPath, f);
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const data = JSON.parse(content);
                    return {
                        name: f.replace('.json', ''),
                        ...data
                    };
                } catch (err) {
                    return {
                        name: f.replace('.json', ''),
                        error: 'Ошибка чтения'
                    };
                }
            });
    }

    function save(folder, name, data) {
        const folderPath = path.join(basePath, folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        const filePath = path.join(folderPath, `${name}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return { success: true, path: filePath };
    }

    function load(folder, name) {
        const filePath = path.join(basePath, folder, `${name}.json`);
        if (!fs.existsSync(filePath)) {
            return { error: 'Файл не найден' };
        }
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        } catch (err) {
            return { error: 'Ошибка чтения файла' };
        }
    }

    function deleteFile(folder, name) {
        const filePath = path.join(basePath, folder, `${name}.json`);
        if (!fs.existsSync(filePath)) {
            return { error: 'Файл не найден' };
        }
        try {
            fs.unlinkSync(filePath);
            return { success: true };
        } catch (err) {
            return { error: 'Ошибка удаления файла' };
        }
    }

    function checkExists(folder, name) {
        const filePath = path.join(basePath, folder, `${name}.json`);
        return fs.existsSync(filePath);
    }

    function findReferences(folder, name, searchFolders) {
        const references = [];
        for (const searchFolder of searchFolders) {
            const list = getList(searchFolder);
            for (const item of list) {
                const data = load(searchFolder, item.name);
                if (data && data.error) continue;
                if (searchFolder === 'checks' && data.tests) {
                    if (data.tests.some(t => t === name || t.name === name)) {
                        references.push({ folder: searchFolder, name: item.name, field: 'tests' });
                    }
                }
                if (searchFolder === 'groups' && data.checks) {
                    if (data.checks.includes(name)) {
                        references.push({ folder: searchFolder, name: item.name, field: 'checks' });
                    }
                }
                if (searchFolder === 'stands' && data.diagram === name) {
                    references.push({ folder: searchFolder, name: item.name, field: 'diagram' });
                }
            }
        }
        return references;
    }

    return { getList, save, load, delete: deleteFile, checkExists, findReferences };
}

const files = fileOperations();

// ============================================================
// КЛАСС TEST_RUNNER
// ============================================================
class TestRunner {
    constructor() {
        this.running = false;
        this.paused = false;
        this.currentGroup = null;
        this.currentCheck = null;
        this.currentTest = null;
        this.currentStep = 0;
        this.testResult = [];
        this.startTime = 0;
        this.timer = null;
        this.mode = 'auto';
        this.callbacks = [];
        this.initialized = false;
        this._initial = [];
        this._triggers = [];
        this._test = [];
        this._currentController = null;
        this.totalSteps = 0;
        this.groupName = '';
        this.checkName = '';
        this.testName = '';
        this.resultId = null;
        this.sessionId = null;
        this.checkData = null;
        this.testIndex = 0;
    }

    init(group, checkIndex, testIndex, mode = 'auto') {
        if (!group || !group.checks || group.checks.length === 0) {
            return { error: 'Группа не содержит проверок' };
        }

        const checkName = group.checks[checkIndex];
        if (!checkName) {
            return { error: 'Проверка не найдена' };
        }

        const checkData = files.load('checks', checkName);
        if (checkData.error) {
            return { error: 'Ошибка загрузки проверки: ' + checkData.error };
        }

        const testName = checkData.tests && checkData.tests[testIndex];
        if (!testName) {
            return { error: 'Тест не найден в проверке' };
        }

        const testData = files.load('tests', testName);
        if (testData.error) {
            return { error: 'Ошибка загрузки теста: ' + testData.error };
        }

        if (!testData.test || testData.test.length === 0) {
            return { error: 'Тест не содержит команд' };
        }

        this.currentGroup = group;
        this.groupName = group.name || 'Группа';
        this.currentCheck = checkData;
        this.checkName = checkName;
        this.checkData = checkData;
        this.currentCheckIndex = checkIndex;
        this.currentTest = testData;
        this.testName = testData.name || 'Тест';
        this.testIndex = testIndex;
        this.currentStep = 0;
        this.testResult = [];
        this.startTime = 0;
        this.mode = mode;
        this.running = false;
        this.paused = false;
        this.initialized = true;
        this.totalSteps = testData.test.length;

        this._initial = checkData.initial || [];
        this._triggers = checkData.triggers || [];
        this._test = testData.test || [];

        this._currentController = this._getController();

        this.sessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        this._saveSession();

        return { success: true, controller: this._currentController, sessionId: this.sessionId };
    }

    _getController() {
        if (this.currentGroup.stand) {
            const standData = files.load('stands', this.currentGroup.stand);
            if (standData && standData.controllers && standData.controllers.length > 0) {
                for (const ctrl of standData.controllers) {
                    if (controllers[ctrl]) {
                        return ctrl;
                    }
                }
                return standData.controllers[0];
            }
        }
        const keys = Object.keys(controllers);
        if (keys.length > 0) {
            return keys[0];
        }
        return null;
    }

    _saveSession() {
        const sessionData = {
            sessionId: this.sessionId,
            group: this.groupName,
            check: this.checkName,
            test: this.testName,
            testIndex: this.testIndex,
            mode: this.mode,
            status: this.running ? 'running' : (this.paused ? 'paused' : 'initialized'),
            step: this.currentStep,
            total: this.totalSteps,
            result: this.testResult,
            startTime: this.startTime,
            lastUpdate: Date.now(),
            controller: this._currentController,
            checkData: this.checkData
        };
        const filePath = path.join(__dirname, 'test_sessions', `${this.sessionId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
    }

    loadSession(sessionId) {
        const filePath = path.join(__dirname, 'test_sessions', `${sessionId}.json`);
        if (!fs.existsSync(filePath)) {
            return { error: 'Сессия не найдена' };
        }
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            this.sessionId = data.sessionId;
            this.groupName = data.group;
            this.checkName = data.check;
            this.testName = data.test;
            this.testIndex = data.testIndex;
            this.mode = data.mode;
            this.currentStep = data.step || 0;
            this.totalSteps = data.total || 0;
            this.testResult = data.result || [];
            this.startTime = data.startTime || 0;
            this._currentController = data.controller || null;
            this.running = data.status === 'running';
            this.paused = data.status === 'paused';
            this.initialized = true;
            this.checkData = data.checkData || null;

            const groupData = files.load('groups', this.groupName);
            if (groupData && !groupData.error) {
                this.currentGroup = groupData;
            }

            if (this.checkData) {
                this.currentCheck = this.checkData;
                const testName = this.checkData.tests && this.checkData.tests[this.testIndex];
                if (testName) {
                    const testData = files.load('tests', testName);
                    if (testData && !testData.error) {
                        this.currentTest = testData;
                        this._test = testData.test || [];
                        this.totalSteps = this._test.length;
                    }
                }
                this._initial = this.checkData.initial || [];
                this._triggers = this.checkData.triggers || [];
            }

            return { success: true };
        } catch (err) {
            return { error: 'Ошибка загрузки сессии' };
        }
    }

    start() {
        if (!this.initialized) {
            return { error: 'Тест не инициализирован' };
        }
        if (this.running) {
            return { error: 'Тест уже запущен' };
        }

        this.running = true;
        this.paused = false;
        this.startTime = Date.now();
        this.testResult = [];
        this.currentStep = 0;
        this._saveSession();

        this._notifyListeners('started', {
            group: this.groupName,
            check: this.checkName,
            test: this.testName,
            totalSteps: this.totalSteps,
            sessionId: this.sessionId
        });

        this._executeInitial();

        return { success: true };
    }

    _executeInitial() {
        for (const cmd of this._initial) {
            if (cmd.length >= 2) {
                this._executeCommand(cmd[0], cmd[1]);
            }
        }

        for (const cmd of this._triggers) {
            if (cmd.length >= 2) {
                this._addTrigger(cmd[0], cmd[1]);
            }
        }

        setTimeout(() => {
            this._executeTest();
        }, 500);
    }

    _executeTest() {
        if (!this.running) {
            this._finish();
            return;
        }

        if (this.paused) {
            this._notifyListeners('paused', {
                step: this.currentStep,
                total: this.totalSteps
            });
            return;
        }

        if (this.mode === 'step') {
            this._notifyListeners('waiting_step', {
                step: this.currentStep,
                total: this.totalSteps
            });
            return;
        }

        this._executeNextStep();
    }

    _executeNextStep() {
        if (this.currentStep >= this._test.length) {
            this._finish();
            return;
        }

        const step = this._test[this.currentStep];
        const time = step[0] || 0;
        const canel = step[1];
        const value = step[2];

        const cmdStartTime = Date.now();
        this._executeCommand(canel, value);

        this.testResult.push([cmdStartTime - this.startTime, canel, value]);

        this._updateCheckCurrent();
        this._saveSession();

        this._notifyListeners('step', {
            step: this.currentStep,
            total: this.totalSteps,
            command: [time, canel, value],
            resultCount: this.testResult.length
        });

        this.currentStep++;

        if (this.mode === 'pause_test') {
            this.paused = true;
            this._saveSession();
            this._notifyListeners('paused_after_test', {
                step: this.currentStep,
                total: this.totalSteps
            });
            return;
        }

        const nextDelay = time > 0 ? time : 100;
        this.timer = setTimeout(() => {
            this._executeTest();
        }, nextDelay);
    }

    _updateCheckCurrent() {
        if (!this.checkData || this.testIndex === undefined) return;
        if (!this.checkData.tests || !this.checkData.tests[this.testIndex]) return;

        const testName = this.checkData.tests[this.testIndex];
        if (!this.checkData._currentResults) {
            this.checkData._currentResults = {};
        }
        this.checkData._currentResults[testName] = this.testResult.slice();
        files.save('checks', this.checkName, this.checkData);
    }

    _executeCommand(canel, value) {
        if (!this._currentController) {
            console.warn(`⚠️ Нет контроллера для команды: ${canel}`);
            return;
        }

        const cmdMap = {
            'green': { api: 'green' },
            'red': { api: 'red' },
            'sound': { api: 'sound' },
            'lock': { api: 'lock' },
            'd0': { api: 'd0' },
            'd1': { api: 'd1' },
            'open_for_out': { api: 'open_for_out' },
            'open_for_in': { api: 'open_for_in' },
            'new_address': { api: 'new_address' }
        };

        const cmdInfo = cmdMap[canel];
        if (!cmdInfo) {
            console.warn(`⚠️ Неизвестная команда: ${canel}`);
            return;
        }

        const commandData = {
            api_key: api_key,
            api: cmdInfo.api,
            controller: this._currentController,
            interval: typeof value === 'number' ? value : 0
        };

        if (canel === 'new_address') {
            commandData.new_adr = typeof value === 'number' ? value : 4;
        }

        this._sendToClients(commandData);
    }

    _addTrigger(canel, value) {
        if (!this._currentController) {
            console.warn(`⚠️ Нет контроллера для триггера: ${canel}`);
            return;
        }

        const commandData = {
            api_key: api_key,
            api: 'trigger_add_sys',
            controller: this._currentController,
            type: canel,
            sost: typeof value === 'object' ? value : value,
            obj: 'func_api',
            callback: 'callback'
        };

        this._sendToClients(commandData);
    }

    _sendToClients(data) {
        const message = JSON.stringify(data);
        for (const id in list_cl) {
            try {
                list_cl[id].send(message);
            } catch (err) {
                console.error('Ошибка отправки клиенту:', err);
            }
        }
    }

    pause() {
        if (!this.running) return { error: 'Тест не запущен' };
        if (this.paused) return { error: 'Уже на паузе' };
        this.paused = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this._saveSession();
        this._notifyListeners('paused', { step: this.currentStep, total: this.totalSteps });
        return { success: true };
    }

    resume() {
        if (!this.running) return { error: 'Тест не запущен' };
        if (!this.paused) return { error: 'Не на паузе' };
        this.paused = false;
        this._saveSession();
        this._notifyListeners('resumed', { step: this.currentStep, total: this.totalSteps });
        this._executeTest();
        return { success: true };
    }

    step() {
        if (!this.running) return { error: 'Тест не запущен' };
        if (this.mode !== 'step') {
            this.mode = 'step';
        }
        this._executeNextStep();
        return { success: true };
    }

    stop() {
        this.running = false;
        this.paused = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this._finish();
        return { success: true };
    }

    _finish() {
        this.running = false;
        this.paused = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (this.testResult.length > 0) {
            this._saveResult();
        }

        this._saveSession();

        this._notifyListeners('finished', {
            result: this.testResult,
            total: this.testResult.length,
            group: this.groupName,
            check: this.checkName,
            test: this.testName
        });
    }

    _saveResult() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultName = `${this.groupName}_${this.checkName}_${this.testName}_${timestamp}`;
        const resultData = {
            name: resultName,
            group: this.groupName,
            check: this.checkName,
            test: this.testName,
            timestamp: timestamp,
            result: this.testResult,
            totalSteps: this.testResult.length,
            controller: this._currentController,
            sessionId: this.sessionId
        };

        files.save('results', resultName, resultData);
        this.resultId = resultName;
    }

    saveAsStandard() {
        if (!this.checkData || this.testIndex === undefined) {
            return { error: 'Нет данных проверки' };
        }
        const testName = this.checkData.tests && this.checkData.tests[this.testIndex];
        if (!testName) {
            return { error: 'Тест не найден' };
        }
        if (this.testResult.length === 0) {
            return { error: 'Нет результатов для сохранения' };
        }

        if (!this.checkData._standards) {
            this.checkData._standards = {};
        }
        this.checkData._standards[testName] = this.testResult.slice();
        files.save('checks', this.checkName, this.checkData);

        this._notifyListeners('standard_saved', {
            check: this.checkName,
            test: this.testName,
            standard: this.testResult
        });

        return { success: true };
    }

    compareWithStandard(tolerance = 100) {
        if (!this.checkData || this.testIndex === undefined) {
            return { error: 'Нет данных проверки' };
        }
        const testName = this.checkData.tests && this.checkData.tests[this.testIndex];
        if (!testName) {
            return { error: 'Тест не найден' };
        }

        const standard = this.checkData._standards && this.checkData._standards[testName];
        if (!standard || standard.length === 0) {
            return { error: 'Нет эталона для сравнения' };
        }

        const current = this.testResult || [];
        return this._compareResults(standard, current, tolerance);
    }

    _compareResults(result1, result2, tolerance = 100) {
        const errors = [];
        const maxLen = Math.max(result1.length, result2.length);

        for (let i = 0; i < maxLen; i++) {
            const r1 = result1[i] || null;
            const r2 = result2[i] || null;

            if (!r1 && r2) {
                errors.push({ index: i, type: 'missing', expected: r2, got: null });
                continue;
            }
            if (r1 && !r2) {
                errors.push({ index: i, type: 'extra', expected: null, got: r1 });
                continue;
            }

            const [time1, canel1, value1] = r1;
            const [time2, canel2, value2] = r2;

            if (canel1 !== canel2) {
                errors.push({ index: i, type: 'command_mismatch', expected: canel2, got: canel1 });
                continue;
            }

            if (value1 !== value2) {
                errors.push({ index: i, type: 'value_mismatch', expected: value2, got: value1 });
                continue;
            }

            const timeDiff = Math.abs(time1 - time2);
            if (timeDiff > tolerance) {
                errors.push({ index: i, type: 'time_mismatch', expected: time2, got: time1, diff: timeDiff });
            }
        }

        return {
            total: maxLen,
            errors: errors,
            errorCount: errors.length,
            success: errors.length === 0
        };
    }

    addListener(callback) {
        this.callbacks.push(callback);
    }

    removeListener(callback) {
        const index = this.callbacks.indexOf(callback);
        if (index !== -1) {
            this.callbacks.splice(index, 1);
        }
    }

    _notifyListeners(event, data) {
        const message = {
            type: 'test_event',
            event: event,
            data: data,
            timestamp: Date.now()
        };
        for (const callback of this.callbacks) {
            try {
                callback(message);
            } catch (err) {
                console.error('Ошибка в слушателе:', err);
            }
        }
        this._sendToClients(message);
    }

    getStatus() {
        return {
            running: this.running,
            paused: this.paused,
            mode: this.mode,
            currentStep: this.currentStep,
            totalSteps: this.totalSteps,
            resultCount: this.testResult ? this.testResult.length : 0,
            group: this.groupName,
            check: this.checkName,
            test: this.testName,
            controller: this._currentController,
            sessionId: this.sessionId
        };
    }

    getResult() {
        return this.testResult;
    }

    getSessionId() {
        return this.sessionId;
    }

    getCheckData() {
        return this.checkData;
    }
}

const testRunner = new TestRunner();

// ============================================================
// ФУНКЦИИ API
// ============================================================
let func_api = {
    types: {
        led: { byte_num: 3, bits: 1 },
        zumm: { byte_num: 3, bits: 2 },
        sound: { byte_num: 3, bits: 4 },
        lock: { byte_num: 3, bits: 8 },
        tm: { byte_num: 4, bits: 4 },
        card_in: { byte_num: 4, bits: 8 },
        exit: { byte_num: 4, bits: 1 },
        card_out: { byte_num: 4, bits: 2 },
        reader: { byte_num: 4, bits: 16 },
        door: { byte_num: 4, bits: 32 },
        v_door: { byte_num: 11, bits: 127 },
        v_led: { byte_num: 12, bits: 127 },
        v_zp: { byte_num: 13, bits: 127 },
        v_12: { byte_num: 14, bits: 127 },
        va_door: { byte_num: 11, min: -20, max: 100, dev: 10 },
        va_led: { byte_num: 12, min: -20, max: 100, dev: 10 },
        va_zp: { byte_num: 13, min: -20, max: 100, dev: 10 },
        va_12: { byte_num: 14, min: -20, max: 100, dev: 10 },
    },
    type_info: {},

    buff_sum: buff_sum,
    getCRC: getCRC,

    plus(value) {
        return new Uint8Array(new Uint16Array([128 * value]).buffer);
    },

    output(thet, bit = 0x04, intervals = 0, intervalm = 0xff) {
        let adr = new Uint8Array([thet.address, 0x06, 0x00, bit, intervals, intervalm]);
        let data = buff_sum([adr, getCRC(adr)]);
        thet.converter.add("q_fast", data);
    },

    green(thet, interval = 2) {
        let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x01, interval[1], interval[0]]);
        let data = buff_sum([adr, getCRC(adr)]);
        thet.converter.add("q_fast", data);
    },

    red(thet, interval = 2) {
        let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x02, interval[1], interval[0]]);
        let data = buff_sum([adr, getCRC(adr)]);
        thet.converter.add("q_fast", data);
    },

    sound(thet, interval = 2) {
        let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x03, interval[1], interval[0]]);
        let data = buff_sum([adr, getCRC(adr)]);
        thet.converter.add("q_fast", data);
    },

    d0(thet, interval = 2) {
        let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x05, interval[1], interval[0]]);
        let data = buff_sum([adr, getCRC(adr)]);
        thet.converter.add("q_fast", data);
    },

    d1(thet, interval = 2) {
        let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x06, interval[1], interval[0]]);
        let data = buff_sum([adr, getCRC(adr)]);
        thet.converter.add("q_fast", data);
    },

    lock(thet, interval = 0) {
        let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x04, interval[1], interval[0]]);
        let data = buff_sum([adr, getCRC(adr)]);
        thet.converter.add("q_fast", data);
    },

    new_address(thet, new_adr = 2) {
        let adr = new Uint8Array([thet.address, 0x06, 0x00, 0x10, new_adr, new_adr]);
        let data = buff_sum([adr, getCRC(adr)]);
        thet.converter.add("q_fast", data);
    },

    survey_receiver(thet, data, ok) {
        if (ok) {
            if (thet.addresses[thet.current.data[0]].active == false) {
                thet.addresses[thet.current.data[0]].active = true;
            }
            if (thet.addresses[thet.current.data[0]].trigger) {
                thet.addresses[thet.current.data[0]].trigger(data);
            }
        } else {
            let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]);
            let data_out = buff_sum([adr, getCRC(adr)]);
            thet.add("q_fast", data_out, func_api.no_ansver_0);
        }
    },

    no_ansver_0(thet, data, ok) {
        if (ok) {
            if (thet.addresses[thet.current.data[0]].active == false) {
                thet.addresses[thet.current.data[0]].active = true;
            }
        } else {
            let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]);
            let data_out = buff_sum([adr, getCRC(adr)]);
            thet.add("q_fast", data_out, func_api.no_ansver);
        }
    },

    no_ansver(thet, data, ok) {
        if (ok) {
            if (thet.addresses[thet.current.data[0]].active == false) {
                thet.addresses[thet.current.data[0]].active = true;
            }
        } else {
            if (thet.addresses[thet.current.data[0]].active == true) {
                thet.addresses[thet.current.data[0]].active = false;
            }
        }
    },

    new_controller(thet, data, ok) {
        if (ok) {
            let number = (+data[10]) * 256 + (+data[9]);
            let type = (+data[3]);
            if (controllers[type + "_" + number]) {
                if (thet.count != controllers[type + "_" + number].converter_count) {
                    controllers[type + "_" + number].converter_count = thet.count;
                    controllers[type + "_" + number].converter = thet;
                    thet.addresses[data[0]] = controllers[type + "_" + number];
                }
                if (controllers[type + "_" + number].address != data[0]) {
                    controllers[type + "_" + number].address = data[0];
                    let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]);
                    let data_out = buff_sum([adr, getCRC(adr)]);
                    thet.addresses[data[0]].request = data_out;
                }
            } else {
                controllers[type + "_" + number] = new Controller(type, number, thet, data[0]);
                console.log(`✅ Новый контроллер: ${type}_${number}`);
                let trigger_info = { api: 'trigger_info', controller: type + '_' + number, name: 'new controller', sost: 1 };
                func_api.for_all_user(trigger_info);
                thet.addresses[data[0]] = controllers[type + "_" + number];
                let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]);
                let data_out = buff_sum([adr, getCRC(adr)]);
                thet.addresses[data[0]].request = data_out;
            }
        }
    },

    finding_controllers_receiver(thet, data, ok) {
        if (ok) {
            let adr = new Uint8Array([data[0], 0x01, 0x00, 0x00, 0x00, 0x05]);
            let data_out = buff_sum([adr, getCRC(adr)]);
            if (thet.addresses[data[0]]) {
                if (!thet.addresses[data[0]].active) {
                    thet.addresses[data[0]].active = true;
                    thet.add("q_fast", data_out, func_api.new_controller);
                }
            } else {
                thet.addresses[data[0]] = { active: true };
                thet.add("q_fast", data_out, func_api.new_controller);
            }
        } else {
            if (thet.addresses[thet.current.data[0]]) {
                if (thet.addresses[thet.current.data[0]].active) {
                    thet.addresses[thet.current.data[0]].active = false;
                }
            }
        }
    },

    finding_controllers_start(converter) {
        for (let i = 0; i < converter.scan_count; i++) {
            func_api.finding_make(converter);
        }
    },

    finding_make(converter) {
        for (let i = 0; i < 40; i++) {
            let adr = new Uint8Array([i, 0x04, 0x00, 0x00, 0x00, 0x05]);
            let data = buff_sum([adr, getCRC(adr)]);
            converter.add("q_main", data, func_api.finding_controllers_receiver);
        }
    },

    survey_make(converter) {
        for (let i in converter.addresses) {
            if (converter.addresses[i].request) {
                converter.add("q_main", converter.addresses[i].request);
            } else {
                let adr = new Uint8Array([i, 0x04, 0x00, 0x00, 0x00, 0x05]);
                let data = buff_sum([adr, getCRC(adr)]);
                converter.addresses[i].request = data;
                converter.add("q_main", data, func_api.finding_controllers_receiver);
            }
        }
        if (converter.scan_current < converter.scan_controllers) {
            converter.scan_current++;
        } else {
            converter.scan_current = 0;
        }
        if (!(converter.scan_current in converter.addresses)) {
            let adr = new Uint8Array([converter.scan_current, 0x04, 0x00, 0x00, 0x00, 0x05]);
            let data = buff_sum([adr, getCRC(adr)]);
            converter.add("q_main", data, func_api.finding_controllers_receiver);
        }
    },

    for_all_user(trigger_info) {
        const message = JSON.stringify(trigger_info);
        for (let i in list_cl) {
            try {
                list_cl[i].send(message);
            } catch (err) {
                console.error('Ошибка отправки клиенту:', err);
            }
        }
    },

    callback(thet) {
        let answer = {
            api: 'trigger_info',
            trigger_info: thet.trigger_info,
            data: thet.data
        };
        func_api.for_all_user(answer);
    },

    answer_send(res, msg) {
        res.writeHead(200);
        if (typeof (msg) == "object") {
            res.end(JSON.stringify(msg));
        } else {
            res.end(msg);
        }
    },

    sendToAllClients(data) {
        const message = JSON.stringify(data);
        for (const id in list_cl) {
            try {
                list_cl[id].send(message);
            } catch (err) {
                console.error('Ошибка отправки клиенту:', err);
            }
        }
    }
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ TYPE_INFO
// ============================================================
function type_i() {
    let temp = {};
    for (let i in func_api.types) {
        if (!temp[func_api.types[i].byte_num]) {
            temp[func_api.types[i].byte_num] = {};
        }
        if (func_api.types[i].bits) {
            temp[func_api.types[i].byte_num][func_api.types[i].bits] = i;
        } else {
            temp[func_api.types[i].byte_num] = i;
        }
    }
    func_api.type_info = temp;
}
type_i();

// ============================================================
// OUT_API — ОБРАБОТЧИКИ КОМАНД
// ============================================================
let out_api = {
    // Управление контроллерами
    controllers_list(req, res, answer) {
        let obj = {};
        for (let i in controllers) {
            obj[i] = {
                type: controllers[i].type,
                number: controllers[i].number,
                address: controllers[i].address,
                active: controllers[i].active,
                triggers: controllers[i].triggers
            };
        }
        answer.list = obj;
        res.send(JSON.stringify(answer));
    },

    converters_list(req, res, answer) {
        const seen = new Map();
        let uniqueConverters = [];
        for (let i = 0; i < converters.length; i++) {
            const c = converters[i];
            const key = c.number + '_' + (c.socket?.remotePort || '');
            if (!seen.has(key)) {
                seen.set(key, true);
                uniqueConverters.push({
                    index: i,
                    model: c.model,
                    number: c.number,
                    version: c.version,
                    connected: c.connected
                });
            }
        }
        let obj = {};
        for (let i = 0; i < uniqueConverters.length; i++) {
            const c = uniqueConverters[i];
            obj[i] = {
                model: c.model,
                number: c.number,
                version: c.version,
                connected: c.connected
            };
        }
        answer.list = obj;
        res.send(JSON.stringify(answer));
    },

    triggers_type(req, res, answer) {
        answer.list = func_api.types;
        res.send(JSON.stringify(answer));
    },

    pattern_list(req, res, answer) {
        let thet = controllers[req.controller];
        answer.pattern_list = thet.pattern;
        res.send(JSON.stringify(answer));
    },

    trigger_add(req, res, answer) {
        let thet = controllers[req.controller];
        if (req.type.slice(0, 2) == 'va') {
            thet.add_trigger({ type: req.type, min: req.min, max: req.max, dev: req.dev, callback: func_api.callback });
        } else {
            thet.add_trigger({ type: req.type, sost: req.sost, callback: func_api.callback });
        }
        answer.ok = 1;
        answer.controller = req.controller;
        answer.triggers = thet.triggers;
        res.send(JSON.stringify(answer));
    },

    trigger_add_sys(req, res, answer) {
        let thet = controllers[req.controller];
        if (req.obj == 'thet') {
            if (req.type.slice(0, 2) == 'va') {
                thet.add_trigger({ type: req.type, min: req.min, max: req.max, dev: req.dev, callback: thet[req.callback] });
            } else {
                thet.add_trigger({ type: req.type, sost: req.sost, callback: thet[req.callback] });
            }
        }
        if (req.obj == 'func_api') {
            if (req.type.slice(0, 2) == 'va') {
                thet.add_trigger({ type: req.type, min: req.min, max: req.max, dev: req.dev, callback: func_api[req.callback] });
            } else {
                thet.add_trigger({ type: req.type, sost: req.sost, callback: func_api[req.callback] });
            }
        }
        answer.ok = 1;
        answer.controller = req.controller;
        answer.triggers = thet.triggers;
        res.send(JSON.stringify(answer));
    },

    trigger_dell(req, res, answer) {
        controllers[req.controller].dell_trigger(req.trigger_id);
        answer.ok = 1;
        answer.controller = req.controller;
        answer.triggers = controllers[req.controller].triggers;
        res.send(JSON.stringify(answer));
    },

    open_for_out(req, res, answer) {
        controllers[req.controller].open_for_out();
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    open_for_in(req, res, answer) {
        controllers[req.controller].open_for_in();
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    green(req, res, answer) {
        let thet = controllers[req.controller];
        func_api.green(thet, func_api.plus(req.interval));
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    red(req, res, answer) {
        let thet = controllers[req.controller];
        func_api.red(thet, func_api.plus(req.interval));
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    sound(req, res, answer) {
        let thet = controllers[req.controller];
        func_api.sound(thet, func_api.plus(req.interval));
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    d0(req, res, answer) {
        let thet = controllers[req.controller];
        func_api.d0(thet, func_api.plus(req.interval));
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    d1(req, res, answer) {
        let thet = controllers[req.controller];
        func_api.d1(thet, func_api.plus(req.interval));
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    lock(req, res, answer) {
        let thet = controllers[req.controller];
        func_api.lock(thet, func_api.plus(req.interval));
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    new_address(req, res, answer) {
        let thet = controllers[req.controller];
        func_api.new_address(thet, req.new_adr);
        answer.ok = 1;
        res.send(JSON.stringify(answer));
    },

    // Стенды
    stands_list(req, res, answer) {
        answer.list = files.getList('stands');
        res.send(JSON.stringify(answer));
    },

    stands_save(req, res, answer) {
        if (files.checkExists('stands', req.name)) {
            const existing = files.load('stands', req.name);
            if (existing && existing.name === req.data.name) {
                const result = files.save('stands', req.name, req.data);
                answer.result = result;
                res.send(JSON.stringify(answer));
                return;
            }
            answer.error = 'Имя уже существует';
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.save('stands', req.name, req.data);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    stands_load(req, res, answer) {
        const data = files.load('stands', req.name);
        answer.data = data;
        res.send(JSON.stringify(answer));
    },

    stands_delete(req, res, answer) {
        const refs = files.findReferences('stands', req.name, ['groups']);
        if (refs.length > 0) {
            answer.error = 'Объект используется в группах: ' + refs.map(r => r.name).join(', ');
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.delete('stands', req.name);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    // Схемы
    diagrams_list(req, res, answer) {
        answer.list = files.getList('diagrams');
        res.send(JSON.stringify(answer));
    },

    diagrams_save(req, res, answer) {
        if (files.checkExists('diagrams', req.name)) {
            const existing = files.load('diagrams', req.name);
            if (existing && existing.name === req.data.name) {
                const result = files.save('diagrams', req.name, req.data);
                answer.result = result;
                res.send(JSON.stringify(answer));
                return;
            }
            answer.error = 'Имя уже существует';
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.save('diagrams', req.name, req.data);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    diagrams_load(req, res, answer) {
        const data = files.load('diagrams', req.name);
        answer.data = data;
        res.send(JSON.stringify(answer));
    },

    diagrams_delete(req, res, answer) {
        const refs = files.findReferences('diagrams', req.name, ['stands']);
        if (refs.length > 0) {
            answer.error = 'Объект используется в стендах: ' + refs.map(r => r.name).join(', ');
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.delete('diagrams', req.name);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    // Тесты
    tests_list(req, res, answer) {
        answer.list = files.getList('tests');
        res.send(JSON.stringify(answer));
    },

    tests_save(req, res, answer) {
        if (files.checkExists('tests', req.name)) {
            const existing = files.load('tests', req.name);
            if (existing && existing.name === req.data.name) {
                const result = files.save('tests', req.name, req.data);
                answer.result = result;
                res.send(JSON.stringify(answer));
                return;
            }
            answer.error = 'Имя уже существует';
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.save('tests', req.name, req.data);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    tests_load(req, res, answer) {
        const data = files.load('tests', req.name);
        answer.data = data;
        res.send(JSON.stringify(answer));
    },

    tests_delete(req, res, answer) {
        const refs = files.findReferences('tests', req.name, ['checks']);
        if (refs.length > 0) {
            answer.error = 'Объект используется в проверках: ' + refs.map(r => r.name).join(', ');
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.delete('tests', req.name);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    // Проверки
    checks_list(req, res, answer) {
        answer.list = files.getList('checks');
        res.send(JSON.stringify(answer));
    },

    checks_save(req, res, answer) {
        if (files.checkExists('checks', req.name)) {
            const existing = files.load('checks', req.name);
            if (existing && existing.name === req.data.name) {
                const result = files.save('checks', req.name, req.data);
                answer.result = result;
                res.send(JSON.stringify(answer));
                return;
            }
            answer.error = 'Имя уже существует';
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.save('checks', req.name, req.data);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    checks_load(req, res, answer) {
        const data = files.load('checks', req.name);
        answer.data = data;
        res.send(JSON.stringify(answer));
    },

    checks_delete(req, res, answer) {
        const refs = files.findReferences('checks', req.name, ['groups']);
        if (refs.length > 0) {
            answer.error = 'Объект используется в группах: ' + refs.map(r => r.name).join(', ');
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.delete('checks', req.name);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    // Группы
    groups_list(req, res, answer) {
        answer.list = files.getList('groups');
        res.send(JSON.stringify(answer));
    },

    groups_save(req, res, answer) {
        if (files.checkExists('groups', req.name)) {
            const existing = files.load('groups', req.name);
            if (existing && existing.name === req.data.name) {
                const result = files.save('groups', req.name, req.data);
                answer.result = result;
                res.send(JSON.stringify(answer));
                return;
            }
            answer.error = 'Имя уже существует';
            res.send(JSON.stringify(answer));
            return;
        }
        const result = files.save('groups', req.name, req.data);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    groups_load(req, res, answer) {
        const data = files.load('groups', req.name);
        answer.data = data;
        res.send(JSON.stringify(answer));
    },

    groups_delete(req, res, answer) {
        const result = files.delete('groups', req.name);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    // Результаты
    result_list(req, res, answer) {
        answer.list = files.getList('results');
        res.send(JSON.stringify(answer));
    },

    result_load(req, res, answer) {
        const data = files.load('results', req.name);
        answer.data = data;
        res.send(JSON.stringify(answer));
    },

    result_delete(req, res, answer) {
        const result = files.delete('results', req.name);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    result_compare(req, res, answer) {
        const result1 = files.load('results', req.name1);
        const result2 = files.load('results', req.name2);
        if (result1.error || result2.error) {
            answer.error = 'Ошибка загрузки результатов';
        } else {
            const comparison = testRunner.compareWithStandard
                ? testRunner.compareWithStandard(req.tolerance || 100)
                : { error: 'Метод сравнения недоступен' };
            answer.comparison = comparison;
            answer.name1 = req.name1;
            answer.name2 = req.name2;
        }
        res.send(JSON.stringify(answer));
    },

    // Управление тестами
    test_init(req, res, answer) {
        const group = files.load('groups', req.groupName);
        if (group.error) {
            answer.error = 'Группа не найдена';
            res.send(JSON.stringify(answer));
            return;
        }

        const sessionFiles = fs.readdirSync(path.join(__dirname, 'test_sessions'));
        for (const file of sessionFiles) {
            if (file.endsWith('.json')) {
                const sessionId = file.replace('.json', '');
                const sessionData = files.load('test_sessions', sessionId);
                if (sessionData && !sessionData.error &&
                    sessionData.group === req.groupName &&
                    sessionData.checkIndex === req.checkIndex &&
                    sessionData.testIndex === req.testIndex &&
                    (sessionData.status === 'running' || sessionData.status === 'paused')) {
                    answer.sessionId = sessionId;
                    answer.restored = true;
                    res.send(JSON.stringify(answer));
                    return;
                }
            }
        }

        const result = testRunner.init(group, req.checkIndex || 0, req.testIndex || 0, req.mode || 'auto');
        answer.result = result;
        answer.sessionId = testRunner.getSessionId();
        res.send(JSON.stringify(answer));
    },

    test_start(req, res, answer) {
        const result = testRunner.start();
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    test_pause(req, res, answer) {
        const result = testRunner.pause();
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    test_resume(req, res, answer) {
        const result = testRunner.resume();
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    test_step(req, res, answer) {
        const result = testRunner.step();
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    test_stop(req, res, answer) {
        const result = testRunner.stop();
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    test_status(req, res, answer) {
        answer.status = testRunner.getStatus();
        res.send(JSON.stringify(answer));
    },

    test_result(req, res, answer) {
        answer.result = testRunner.getResult();
        res.send(JSON.stringify(answer));
    },

    test_session_load(req, res, answer) {
        const result = testRunner.loadSession(req.sessionId);
        if (result.success) {
            answer.status = testRunner.getStatus();
            answer.result = testRunner.getResult();
            answer.checkData = testRunner.getCheckData();
        } else {
            answer.error = result.error;
        }
        res.send(JSON.stringify(answer));
    },

    test_save_standard(req, res, answer) {
        const result = testRunner.saveAsStandard();
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    test_compare_standard(req, res, answer) {
        const result = testRunner.compareWithStandard(req.tolerance || 100);
        answer.result = result;
        res.send(JSON.stringify(answer));
    },

    test_sessions_list(req, res, answer) {
        const sessionFiles = fs.readdirSync(path.join(__dirname, 'test_sessions'));
        const sessions = [];
        for (const file of sessionFiles) {
            if (file.endsWith('.json')) {
                const sessionId = file.replace('.json', '');
                const data = files.load('test_sessions', sessionId);
                if (data && !data.error) {
                    sessions.push({
                        sessionId: sessionId,
                        group: data.group,
                        check: data.check,
                        test: data.test,
                        status: data.status,
                        step: data.step,
                        total: data.total,
                        lastUpdate: data.lastUpdate
                    });
                }
            }
        }
        answer.sessions = sessions;
        res.send(JSON.stringify(answer));
    },

    available_controllers(req, res, answer) {
        const list = Object.keys(controllers).map(key => ({
            id: key,
            type: controllers[key].type,
            number: controllers[key].number,
            active: controllers[key].active
        }));
        answer.list = list;
        res.send(JSON.stringify(answer));
    }
};

// ============================================================
// ОБРАБОТЧИК ЗАГРУЗКИ ФАЙЛОВ
// ============================================================
function handleFileUpload(req, res) {
    const boundary = req.headers['content-type'].split('boundary=')[1];
    if (!boundary) {
        res.writeHead(400);
        res.end('No boundary');
        return;
    }

    let body = [];
    req.on('data', (chunk) => {
        body.push(chunk);
    });

    req.on('end', () => {
        const buffer = Buffer.concat(body);
        const parts = parseMultipart(buffer, boundary);

        let fileName = '';
        let fileData = null;
        let fieldName = '';

        for (const part of parts) {
            const match = part.headers.match(/name="([^"]+)"/);
            if (match) {
                fieldName = match[1];
            }

            if (fieldName === 'file' && part.data.length > 0) {
                const filenameMatch = part.headers.match(/filename="([^"]+)"/);
                if (filenameMatch) {
                    fileName = filenameMatch[1];
                }
                fileData = part.data;
            }
        }

        if (!fileData) {
            res.writeHead(400);
            res.end('No file uploaded');
            return;
        }

        const ext = path.extname(fileName);
        const name = path.basename(fileName, ext);
        const timestamp = Date.now();
        const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '_');
        const newFileName = `${safeName}_${timestamp}${ext}`;
        const filePath = path.join(__dirname, 'diagrams/files', newFileName);

        fs.writeFileSync(filePath, fileData);

        const url = `/diagrams/files/${newFileName}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, url: url, filename: newFileName }));
    });
}

function parseMultipart(buffer, boundary) {
    const parts = [];
    const delimiter = Buffer.from(`--${boundary}`);
    const endDelimiter = Buffer.from(`--${boundary}--`);

    let start = 0;
    while (start < buffer.length) {
        const endIndex = buffer.indexOf(delimiter, start);
        if (endIndex === -1) break;

        const partStart = endIndex + delimiter.length;
        if (buffer.indexOf(endDelimiter, start) === start) break;

        const partEnd = buffer.indexOf(delimiter, partStart);
        if (partEnd === -1) break;

        const partBuffer = buffer.subarray(partStart, partEnd);
        const headersEnd = partBuffer.indexOf('\r\n\r\n');
        if (headersEnd === -1) break;

        const headers = partBuffer.subarray(0, headersEnd).toString();
        const data = partBuffer.subarray(headersEnd + 4);

        parts.push({ headers, data });
        start = partEnd;
    }

    return parts;
}

// ============================================================
// UDP СЕРВЕР
// ============================================================
const server_udp = dgram.createSocket("udp4");
server_udp.bind(function () {
    server_udp.setBroadcast(true);
    broadcastNew();
    setInterval(broadcastNew, 3000);
});

server_udp.on('message', function (message, rinfo) {
    let msg = {};
    msg.from = rinfo.address;
    let str = String(message);
    let arr = str.split(' ');
    for (let i in arr) {
        let k = arr[i].split(':');
        if (i == 0) {
            msg.model = k[0].slice(0, -3);
        }
        if (k.length > 1) {
            msg[k[0]] = k[1];
            if (k[0].includes('SW')) {
                msg.version = k[1];
            }
        } else {
            let ind = k[0].indexOf('SN');
            if (k[0].includes('SN')) {
                msg.number = k[0].slice(ind + 2);
            }
        }
    }
    if ((msg.L1_Port == port_client) || (msg.L2_Port == port_client)) {
        if ((msg.L1_Conn == '0.0.0.0') && (msg.L2_Conn == '0.0.0.0')) {
            new_client(msg);
        }
    }
});

function broadcastNew() {
    var message = Buffer.from("SEEK Z397IP");
    server_udp.send(message, 0, message.length, port_udp, broadcast_adr, function () {});
}

// ============================================================
// TCP CLIENT
// ============================================================
function new_client(msg) {
    let client = new net.Socket();
    let converter;
    client.connect(port_client, msg.from, function () {
        let number = converters.length;
        if (!(client.remoteAddress in converters)) {
            console.log(`🔌 CONNECTED: ${number}  ${client.remoteAddress}:${client.remotePort}`);
            client.write(Buffer.from([0xFF, 0xFA, 0x2C, 0x01, 0x00, 0x00, 0x96, 0x00, 0xFF, 0xF0]));
            converters[number] = new Converter(client, msg);
            converter = converters[number];
            converter.count = number;
            setTimeout(() => func_api.finding_controllers_start(converters[number]), 700);
        }
    });

    client.on('data', function (data) {
        converter.listener(data);
        converter.last_answer = +(new Date());
    });

    client.on('close', function () {
        converter.connected = false;
        converter.q_fast = [];
        converter.i_fast = -1;
        converter.q_main = [];
        converter.i_main = -1;
    });

    client.on('error', function () {});
}

// ============================================================
// TCP SERVER
// ============================================================
const server = net.createServer();
server.listen(port, host, () => {
    console.log(`🔌 TCP Server: ${host}:${port}`);
});

server.on('connection', function (sock) {
    let msg = { model: "z-397 web", number: "123", version: "567" };
    let converter;
    let number = converters.length;

    if (!(sock.remoteAddress in converters)) {
        console.log(`🔌 CONNECTED: ${number}  ${sock.remoteAddress}:${sock.remotePort}`);
        converters[number] = new Converter(sock, msg);
        converter = converters[number];
        converter.count = number;
        setTimeout(() => func_api.finding_controllers_start(converters[number]), 700);
    }

    sock.on('data', function (data) {
        converter.listener(data);
        converter.last_answer = +(new Date());
    });

    sock.on('error', function (data) {});

    sock.on('close', function (data) {
        converter.connected = false;
        converter.q_fast = [];
        converter.i_fast = -1;
        converter.q_main = [];
        converter.i_main = -1;
    });
});

// ============================================================
// HTTP СЕРВЕР
// ============================================================
const server_http = http.createServer((req, res) => {
    let first_url = req.url;

    if (first_url === '/upload_diagram' && req.method === 'POST') {
        handleFileUpload(req, res);
        return;
    }

    if (req.method == 'GET') {
        send_file(res, first_url);
    }
    if (req.method == 'POST') {
        send_post(req, res);
    }
});
server_http.listen(port_http);

function send_file(res, first_url) {
    let new_url;
    try {
        new_url = decodeURIComponent(first_url);
    } catch (e) {
        res.statusCode = 400;
        res.end("Bad request");
        return;
    }

    if (~new_url.indexOf('\0')) {
        res.statusCode = 400;
        res.end("Realy Bad request");
        return;
    }

    let mimeType = path.extname(new_url);
    if (!new_url.includes(folder) && !new_url.includes('diagrams/files')) {
        new_url = path.normalize(path.join("\\", folder, new_url));
    }

    let all_url = path.normalize(path.join(__dirname, new_url));

    if (!mimeType) {
        mimeType = ".html";
        all_url = path.normalize(path.join(all_url, "/index.html"));
    }

    fs.stat(all_url, function (err, st) {
        fs.readFile(all_url, function (err, content, the_type = mimeType) {
            if (err) {
                res.writeHead(400, { 'Content-Type': 'text' });
                res.end('no file');
            } else {
                res.writeHead(200, { 'Content-Type': the_type });
                res.end(content);
            }
        });
    });
}

function send_post(req, res) {
    let body = [];
    req.on('error', function (err) {
        console.error(err);
    }).on('data', function (chunk) {
        body.push(chunk);
    }).on('end', function () {
        body = Buffer.concat(body).toString();
        try {
            let data = JSON.parse(body);
            if (data.command in out_api) {
                out_api[data.command](req, res, data);
            } else {
                func_api.answer_send(res, "no the command");
            }
        } catch (e) {
            console.error(e);
            func_api.answer_send(res, "error");
        }
        res.on('error', function (err) {
            console.error(err);
        });
    });
}

// ============================================================
// WEB SOCKET СЕРВЕР
// ============================================================
const wsServer = new WebSocket.Server({ port: port_ws });
wsServer.on('connection', onConnect);

let num = 0;

function onConnect(wsClient) {
    let id = num++;
    list_cl[id] = wsClient;

    function fnk(thet) {
        let answer = {};
        answer.api = 'trigger_info';
        answer.trigger_info = thet.trigger_info;
        answer.trigger_info.data = thet.data;
        wsClient.send(JSON.stringify(answer));
    }
    list_cl[id].callback = fnk;

    console.log('👤 Новый пользователь: ' + id);

    list_cl[id].on('close', function() {
        console.log('👤 Пользователь отключился: ' + id);
        delete list_cl[id];
        admins.delete(id);
    });

    list_cl[id].on('message', function(message) {
        let answer = {};
        try {
            let jsonObj = JSON.parse(message);
            answer.check_admin = 0;
            if ('api_key' in jsonObj) {
                if (jsonObj.api_key == api_key) {
                    answer.check_admin = 1;
                    answer.api = jsonObj.api;
                    if (jsonObj.api in out_api) {
                        const resObj = {
                            send: function(data) {
                                list_cl[id].send(data);
                            }
                        };
                        out_api[jsonObj.api](jsonObj, resObj, answer);
                    } else {
                        answer.info = 'wrong api';
                        list_cl[id].send(JSON.stringify(answer));
                    }
                } else {
                    answer.info = 'wrong api_key';
                    list_cl[id].send(JSON.stringify(answer));
                }
            } else {
                answer.info = 'wrong message';
                list_cl[id].send(JSON.stringify(answer));
            }
        } catch (error) {
            console.log('Ошибка:', error);
        }
    });

    // Отправляем текущий статус теста при подключении
    const status = testRunner.getStatus();
    if (status.running || status.paused) {
        wsClient.send(JSON.stringify({
            type: 'test_event',
            event: 'status',
            data: status,
            timestamp: Date.now()
        }));
        const result = testRunner.getResult();
        if (result && result.length > 0) {
            wsClient.send(JSON.stringify({
                api: 'test_result_update',
                result: result,
                step: status.currentStep,
                total: status.totalSteps,
                running: status.running,
                paused: status.paused
            }));
        }
    }
}

// ============================================================
// ЗАВЕРШЕНИЕ
// ============================================================
process.on('SIGINT', function () {
    console.log('\n🛑 Сервер остановлен');
    process.exit();
});

console.log('========================================');
console.log('✅ Сервер готов к работе');
console.log('========================================');