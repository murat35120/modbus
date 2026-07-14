const http = require('http'); //клиентский сервер
const fs = require('fs'); //работа с файлами
const path = require('path'); //работа с путями
const os = require('os'); //поиск своего IP адреса
const net = require('net'); //TCP socket
const dgram = require('dgram');//UDP socket
const port = 25000;
const port_client=1000;
const port_http=8080;
//const roles=["manager", "admin"];
const port_udp = 9000;
const broadcast_adr = "255.255.255.255";
const ip_adresses = os.networkInterfaces();

let converters = {}; //список конвертеров
let controllers={};  //список объектов найденных контроллеров по сетевым адресам
let cards={};  //список объектов карт по номерам карт
let t_start;  //отладочная переменная для измерения времени ответа

let host = '10.4.9.117';
for(const i in ip_adresses){ // получаем свой IP адрес для TCP, UDP и HTTP серверов
	for(const k in ip_adresses[i]){
		if(ip_adresses[i][k].family == 'IPv4'){
			if(ip_adresses[i][k].address!="127.0.0.1"){
				host=ip_adresses[i][k].address;
				console.log("HTTP Server running at http://" + host + ':' + port_http)
			}
		}
	}
}



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
		if(!(msg.number in converters)){
		console.log('CONNECTED: '+ msg.number+'  ' + client.remoteAddress + ':' + client.remotePort);
		//client.write(Buffer.from([0xFF, 0xFA, 0x2C, 0x01, 0x00, 0x00, 0x96, 0x00, 0xFF, 0xF0]));// для modbus 38400
		//client.write(Buffer.from([0xFF, 0xFA, 0x2C, 0x01, 0x00, 0x03, 0x84, 0x00, 0xFF, 0xF0]));//Для  "ADVANCED"
		converters[msg.number]=new Converter(client, msg);
		converter=converters[msg.number];
		//начинаем поиск контроллеров
		setTimeout(()=>func_api.finding_controllers_start(converters[msg.number]), 700);
		}else{
			converter=converters[msg.number];
			converter.socket=client;
			console.log('OLD CONNECTED: '+ msg.number+'  ' + client.remoteAddress + ':' + client.remotePort);
			converter.q_fast=[];
			converter.i_fast=-1;
			converter.q_main=[]; //объекты очереди {func, data, callback} - ссылка на функцию команды, данные команды, куда вернуть ответ 
			converter.i_main=-1
			setTimeout(()=>func_api.finding_controllers_start(converters[msg.number]), 700);
		}
	});
	client.on('data', function(data) {
		converter.listener(data);
	});
	client.on('close', function() {
		//console.log(converter.number+' client closed');
		//converter.connected=false; 
		//setTimeout(broadcastNew, 3000);
	});
	client.on('error', function() {
		//converter.connected=false;
		//console.log(converter.number+" error client ");
	});
}
//----------------------------<<<------------------------------


//TCP server,  конвертеры в режиме клиент -------------->>>-------
const server = net.createServer();
server.listen(port, host, () => {
console.log('TCP Server running at ' + host + ' port '+ port);
});

server.on('connection', function(sock) {
	let obj={socket:sock, data:""};
	obj.queue=new Set(); //очередь
	obj.stack=[]; //стэк
	obj.cmd_id=0;
	//console.log('CONNECTED: ' + obj.socket.remoteAddress + ':' + obj.socket.remotePort);
	//obj.socket.write(Buffer.from([0xFF, 0xFA, 0x2C, 0x01, 0x00, 0x03, 0x84, 0x00, 0xFF, 0xF0]));//Для перевода конвертера в режим "ADVANCED" необходимо установить скорость линии 230400:
	obj.socket.on('data', function(data) {
		obj.data=data;
		func_api.answer(obj);	
	});
	obj.socket.on('error', function(data) {
		console.log("error from ");
	});
	obj.socket.on('close', function(data) {
		//console.log(obj.name+' server closed');
		//converters[obj.name].connected=false; 
	});
	in_api.queue_add(obj, {}, in_api.new_sock);
	in_api.queue_add(obj, {}, in_api.read_lic);
	
});
//--------------<<<------------------------------------------------------


//HTTP сервер,  получаем команды API ---------->>>--------------
const server_http = http.createServer((req, res) => {
    let first_url=req.url;
	if(req.method=='GET'){ // запросы страниц
		//send_file( res, first_url);
		console.log('get -'+ first_url);
	}
	if(req.method=='POST'){ // запросы API
		send_post(req, res);
	}
}); 
server_http.listen(port_http);

function send_post(req, res){
    let body = [];
    req.on('error', function(err) {
        console.error(err);
    }).on('data', function(chunk) {
        body.push(chunk);
    }).on('end', function() {
        body = Buffer.concat(body).toString();
        try {
            let obj={}; 
			let data = JSON.parse(body);
			obj.role=path.basename(req.url);
			if(roles.includes(obj.role)){
				if(data.command in out_api){
					if(data.conv){
						in_api.queue_add(converters[data.conv], {reg:req, res:res, data:data, obj:obj}, out_api[data.command]);
					}else{
						out_api[data.command](req, res, data, obj);
					}
				}else{
					functions.answer_send(res, "no the command");
				}
			}else{
				functions.answer_send(res, "no the role");
			}	
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
		this.i_main=-1;
		this.survey=''; // интервал сканирования
		this.finding='';//интервал поиска
		this.scan_count=1;
		this.scan_controllers=30;
		this.scan_current=0;
		this.pause=2;//Пауза перед отправкой
		this.wait=18;//Ожидание до нет ответа
		this.timer; //указатель на текущий таймер ответа - для перехода в случае не ответа
		this.number=msg.number;
		this.version=msg.version;
		this.model=msg.model;
		this.type="fast";
		this.current='';//указатель на текущую операцию
		this.addresses={}; //адреса контроллеров в сети RS485, объект объектов  {type, number, active}
		this.connected=true;
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
				func_api.survey_make(this);
			}
		}
		function step (type, thet){
			let i="i_"+type;
			let q="q_"+type;
			thet[i]++;
			thet.type=type;
			thet.current=thet[q][thet[i]];
			t_start=+new Date();
			thet.socket.write(thet.current.data); 
			thet.timer=setTimeout(()=>{
				clearTimeout(thet.timer);
				thet.current.receiver(thet, thet.current.data, false);
				thet.next();
			}, thet.wait); //время ожидания ответа 
		}
	}
	listener(data){
		//console.log(data);
		let msg=data.subarray(0,data.length-2);
		//console.log(msg);
		let dd=func_api.getCRC(msg);
		//console.log(dd[0].toString(16)+dd[1].toString(16) );
		//console.log(data.subarray(data.length-2));
		
		let check=1;
		for (let j=0; j<1; j++){
			if(+this.current.data[j]!=+data[j]){
				check=0;
			}
		}
		if(check){
			clearTimeout(this.timer);
			this.current.receiver(this, data, true);
			setTimeout(()=>this.next(), this.pause);
		}
	}
}

class controller{
	constructor(type, number, converter, address) {
		this.converter=converter; //конвертер к которому подключен этот контроллер
		this.address=address; //сетевой RS485 адрес контроллера 
		this.type=type; //тип контроллера 
		this.number=number; //серийный номер контроллера
		this.active=true; //отвечает или нет
		this.request='';
		this.triggers=[]; //активные триггеры
		this.pattern={}; //итоговый объект для работы с триггерами
		this.add_trigger({type:"door", sost:32, callback:func_api.test});
		//this.add_trigger({type:"tm", sost:4, callback:func_api.test});
		//this.add_trigger({type:"tm", sost:8, callback:func_api.test});
		//this.add_trigger({type:"exit", sost:1, callback:func_api.test});
		//this.add_trigger({type:"exit", sost:2, callback:func_api.test});
		//this.add_trigger({type:"v_door", sost:128, callback:func_api.test});
		//this.add_trigger({type:"v_door", sost:128, callback:func_api.test1});
		//this.add_trigger({type:"v_led", sost:0, callback:func_api.test});
		//this.add_trigger({type:"v_zp", sost:0, callback:func_api.test});
		this.add_trigger({type:"va_zp", min:-20, max:100, dev:10, callback:func_api.test1});		
		//текущее состояние триггера нужно хранить в самом объекте триггера!!!!
		//логика триггера напряжения 

		
		
	}
	add_trigger(trigger_set){
		let trigger_id;
		if(trigger_set.type in func_api.types){ 
			for(let item in func_api.types[trigger_set.type]){
				trigger_set[item]=func_api.types[trigger_set.type][item];
			}
			trigger_set.temp=false;
			trigger_id=this.triggers.push(trigger_set)-1;
		}
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
					if(this.triggers[i].byte_num.a){
						this.pattern[this.triggers[i].byte_num].a.push(this.triggers[i]);
					}else{
						this.pattern[this.triggers[i].byte_num]={a:[this.triggers[i]]};
					}
				}else{
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
		return trigger_id;
	}
	dell_trigger(trigger_id){
		
	}
	trigger(data){
		for(let byte_num in this.pattern){
			if(this.pattern[byte_num].bits){
				let temp_data=(+data[byte_num])&(+this.pattern[byte_num].for_all);
				if(temp_data!=this.pattern[byte_num].temp){	
					for(let bits in this.pattern[byte_num].bits){
						if(+(temp_data&bits)!=+(this.pattern[byte_num].temp&bits)){
							for(let sost in this.pattern[byte_num].bits[bits].sost){
								if(temp_data==sost){
									for (let cb=0; cb<this.pattern[byte_num].bits[bits].sost[sost].length; cb++){
										this.pattern[byte_num].bits[bits].sost[sost][cb](this.number+' / '+ this.pattern[byte_num].bits[bits].type+' / '+temp_data);
									} 
								}
							}
						}
					}
					this.pattern[byte_num].temp=temp_data;
				}
			}
			if(this.pattern[byte_num].a){
				//тут нужна проверка на пороги срабатывания
				let val=(+data[byte_num]);
				for(let k=0; k< this.pattern[byte_num].a.length; k++){
					//console.log(this.pattern[byte_num].a[k].temp);
					//console.log(val);
					//if(this.pattern[byte_num].a[k].temp){
					if((val< this.pattern[byte_num].a[k].min-this.pattern[byte_num].a[k].dev)||(val> this.pattern[byte_num].a[k].max+this.pattern[byte_num].a[k].dev)){
						//console.log(1);
						if(this.pattern[byte_num].a[k].temp){
							this.pattern[byte_num].a[k].temp=false;
						}
					}
					if((val> (+this.pattern[byte_num].a[k].min)+(+this.pattern[byte_num].a[k].dev))&&(val< (+this.pattern[byte_num].a[k].max)-(+this.pattern[byte_num].a[k].dev))){
						if(!this.pattern[byte_num].a[k].temp){
							this.pattern[byte_num].a[k].temp=true;
							this.pattern[byte_num].a[k].callback(this.number+' / '+ this.pattern[byte_num].a[k].type+' / '+val);					
						}
					}					
				} 
			}
		}
	}
}

let func_api={
	types:{
		led:{byte_num:3, bits:1},
		zumm:{byte_num:3, bits:2},
		sound:{byte_num:3, bits:4},
		lock:{byte_num:3, bits:8},
		tm:{byte_num:4, bits:12},
		exit:{byte_num:4, bits:3},
		reader:{byte_num:4, bits:16},	
		door:{byte_num:4, bits:32},
		v_door:{byte_num:11, bits:128},
		v_led:{byte_num:12, bits:128},
		v_zp:{byte_num:13, bits:128},
		v_12:{byte_num:14, bits:128},
		va_door:{byte_num:11},
		va_led:{byte_num:12},
		va_zp:{byte_num:13},
		va_12:{byte_num:14},
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
			thet.addresses[thet.current.data[0]].trigger(data);
		}else{
			let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
			let data_out = func_api.buff_sum([adr, func_api.getCRC(adr)]);
			thet.add("q_fast", data_out, func_api.no_ansver_0);
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
		}
	},
	no_ansver(thet, data, ok){
		if(ok){
			if(thet.addresses[thet.current.data[0]].active==false){
				console.log(thet.current.data[0]+" active");
				thet.addresses[thet.current.data[0]].active=true;
			}
		}else{
			if(thet.addresses[thet.current.data[0]].active==true){
				console.log(thet.current.data[0]+" no active");
				thet.addresses[thet.current.data[0]].active=false;
			}
		}
	},
	new_controller(thet, data, ok){//получаем информацию о контроллере
		if(ok){
			let number=(+data[10])*256 + (+data[9]);
			let type=(+data[3]);
			if(controllers[type+"_"+number]){
				if(controllers[type+"_"+number].address!=data[0]){
					controllers[type+"_"+number].address=data[0];
					let adr = new Uint8Array([data[0], 0x04, 0x00, 0x00, 0x00, 0x05]); //запрос текущего состояния
					let data_out = func_api.buff_sum([adr, func_api.getCRC(adr)]);
					thet.addresses[data[0]].request=data_out; //сохраняем запрос для повторного использования
				}
			}else{
				controllers[type+"_"+number]=new controller (type, number, thet, data[0]);
				console.log(thet.current.data[0]+" New - "+number);
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
					console.log(thet.current.data[0]+" active 341");
				}
			}else{
				thet.addresses[data[0]]={active:true}
				thet.add("q_fast", data_out, func_api.new_controller);
			}
		}else{
			if(thet.addresses[thet.current.data[0]]){
				if(thet.addresses[thet.current.data[0]].active){
					thet.addresses[thet.current.data[0]].active=false;
					console.log(thet.current.data[0]+" no active 352");
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
		//}, converter.wait*500);
	},
	finding_make(converter){
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
			converter.add("q_main", converter.addresses[i].request);
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
};



