let abonent={
	key:'',
	session:'',	
	domain:'',
	port:'',
	run:1,
	ask:0,
	find:0,
};
let controllers={};  //список объектов найденных контроллеров по сетевым адресам
let cards={};  //список объектов карт по номерам карт
let aa; //= new MyClass(abonent.writer); //параметр - функция отправки сообщения
let t_start;  //отладочная переменная для измерения времени ответа

class MyClass { //задача очереди: создать и добавить генераторы,по очереди перебирать их
	constructor(writer) {
		this.writer = writer; //функция через которую отправляем сообщения
	}
	queue=new Set(); //очередь
	done=true; //текущее состояние очереди
	callback={}; //функция вобратного вызова устанавливается при добавлении в очередь
	iterator={}; //итератор
	buffer={}; //текущая команда
	timer; //указатель на текущий таймер ответа
	listener(data) {//получатель ответных сообщений
		clearTimeout(aa.timer);
		if(this.buffer){
			if(this.buffer.callback){
				this.buffer.callback(data);
			}
			this.buffer.gen.next(data);
		}
	}
	add(func,  data, writer, comment, callback) {//функция добавления в очередь
		let gen=func.call(this, data, writer, comment);
		let step={gen, callback};
		if(this.done){
			this.queue.clear();
			this.queue.add(step);
			this.iterator = this.queue[Symbol.iterator](); //итератор для очереди
			let result=this.iterator.next();
			this.done=result.done;
			this.buffer=result.value;
			this.buffer.gen.next();
		}else{
			this.queue.add(step);
		}

	}
	next(comment) { //следующий шаг в очереди
		if(comment){
			control.writer(comment); //пишем в окно
		}
		let result=this.iterator.next();
		this.done=result.done;
		this.buffer=result.value;
		if(!this.done){
			this.buffer.gen.next();
		}else{
			if(abonent.ask){
				control.sk();
			}
			if(abonent.find){
				control.fnd();
			}
		}
	}
}




function *gen(data, writer, comment){ //команда с переходом по времени выводом результата в окно
	let txt=new Uint8Array(0);
	this.writer.write(data); //отправляем подготовленное сообщение
	let timer=setTimeout(()=>{control[writer]( txt, comment); this.next();}, 35);
	let answer = yield; //получаем ответ от устройства
	while(true) {
		txt = control.buff_sum([txt, answer]);
		if(txt.length>=13){
			clearTimeout(timer);
			if(data[0]){
				if(!(data[0] in controllers)){
					controllers[data[0]]={address:data[0]};
					controllers[data[0]].open_door=return_null();//заглушка
				}
			}
			let timer1=setTimeout(()=>{ this.next();}, 5)
		}
		answer = yield;
	}
}


function *scan(data, writer, comment){ //команда с переходом по команде вложенной функции
	let txt=new Uint8Array(0);
	this.writer.write(data); //отправляем подготовленное сообщение
	let timer=setTimeout(()=>{this.next();}, 110);
	let answer = yield; //получаем ответ от устройства
	while(true) {
		txt = control.buff_sum([txt, answer]);
		if(txt.length>=13){
			clearTimeout(timer);
			txt=new Uint8Array(0);
			//control[writer]( answer, comment);
			console.log(writer+" open_door -1");
			if(answer[4]&0x1F){//ТМ
				//по адресу находим объект контроллера
				//в этот объект вставляем экземпляр генератора open_door
				//если есть карта, добавляем ее номер в объект cards
				console.log("new skud");
				if(answer[0] in controllers){
					//controllers[answer[0]].open_door=open_door();
					//controllers[answer[0]].open_door.next();
					yield* open_door (answer, comment);
				}
			}else{
				console.log("skud 2");
				//controllers[answer[0]].open_door.next();
				yield* return_null (answer, comment)
			}
		}
		answer = yield;
	}
}

function *open_door(data, comment){ //команда обработки событий СКУД
		//выводим сообщение
		pole.innerText=data+"\r\n"+(+new Date()-t_start);
		t_start=+new Date();
		let adr = new Uint8Array([data[0], 0x06, 0x00, 0x04, 0x00, 0xFF]); //открыть замок
		let msg = control.buff_sum([adr, getCRC(adr)]);//расчитать CRC
		let timer3=setTimeout(()=>{this.writer.write(msg);}, 5)
		console.log("open_door 1");
		yield 1;
		pole.innerText=data+"\r\n"+(+new Date()-t_start);
		t_start=+new Date();
		adr = new Uint8Array([data[0], 0x06, 0x00, 0x01, 0x00, 0xFF]); //зеленый светодиод
		msg = control.buff_sum([adr, getCRC(adr)]);//расчитать CRC
		timer3=setTimeout(()=>{this.writer.write(msg);}, 5)
		console.log("open_door 2");
		yield 2;
		pole.innerText=data+"\r\n"+(+new Date()-t_start);
		t_start=+new Date();
		adr = new Uint8Array([data[0], 0x06, 0x00, 0x03, 0x00, 0xFF]); //звук
		msg = control.buff_sum([adr, getCRC(adr)]);//расчитать CRC
		timer3=setTimeout(()=>{this.writer.write(msg);}, 5)
		console.log("open_door 0");
		//yield 2;
		this.next();
		yield 0;
}
function *return_null(data, comment){ //функция заглушка
	while(true) {
		//выводим сообщение
		pole.innerText=data+"\r\n"+(+new Date()-t_start);
		t_start=+new Date();
		this.next();
		yield 0;
	}
}


function pt(data){  //передача сообщения внешнему API
	console.log("print - "+new TextDecoder("utf-8").decode(data));
}


let links={ //связываем действия пользователя с функциями
	click:{}, //кнопки
	formats:{},
	felds:{},  //поля для ручного ввода данных
	selects:{}, //элементы selektые,

    call_func (e){
		let link=e.target;
        name=link.dataset.click;
        if(name!='undefined'){ //функции по клику
			control[name](link); 
        }
    },
    call_func_chng (e){
        let link=e.target;
        name=link.dataset.id;
        if(link.dataset.id){ //функции по изменению
			control[name](link);
        }
    },
};

let control={
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
	ask(link){
		if(link.dataset.in==1){
			link.dataset.in=0;
			abonent.ask=0;
		}else{
			link.dataset.in=1;
			abonent.ask=1;
			control.sk();
			links.click.find.dataset.in=0;
			abonent.find=0;
		}
	},
	sk(){
		for (let value in controllers) {
			let adr = new Uint8Array([value, 0x04, 0x00, 0x00, 0x00, 0x05]); //опрос первого адреса
			let data = control.buff_sum([adr, getCRC(adr)]);
			aa.add(scan, data, "skud", "ask","");
		}
	},
	find(link){
		if(link.dataset.in==1){
			link.dataset.in=0;
			abonent.find=0;
		}else{
			link.dataset.in=1;
			abonent.find=1;
			control.fnd();
			links.click.ask.dataset.in=0;
			abonent.ask=0;
		}
	},
	fnd(){
		for(i=1; i<25; i++){
			let adr = new Uint8Array([i, 0x04, 0x00, 0x00, 0x00, 0x05]); //опрос первого адреса
			let data = control.buff_sum([adr, getCRC(adr)]);
			aa.add(gen, data, "finder", "find",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
		}
		let asd="";
		for (let value in controllers) {
			asd=asd+" "+value;
		}
		
		if(+new Date()-t_start){
			pole.innerText="Addresses found: "+asd+"\r\n"+(+new Date()-t_start);
		}
		t_start=+new Date();
	},

	clear(link){
		pole.innerText="";
	},
	service(link){
		if(link.dataset.in==1){
			link.dataset.in=0;
			for(let i in links.formats){
				links.formats[i].style.display="none";
			}
			links.click["set"].style.visibility="hidden";
			links.click["get"].style.visibility="hidden";
		}else{
			link.dataset.in=1;
			for(let i in links.formats){
				links.formats[i].style.display="flex";
			}
			links.click["set"].style.visibility="visible";
			links.click["get"].style.visibility="visible";
		}
	},
	recovery(link){ //подключение (выбор) ком порта (канал ввода вывода)
		let filters = [
			{ usbVendorId: 8580, usbProductId: 17 }
		];
		let settings = {
			baudRate: 38400,
			dataBits: 8,
			stopBits: 1,
			parity: "none",
			flowControl: "none"
		};
		(async () => { //ввод и вывод данных порта
			//port = await navigator.serial.requestPort({filters}); //выбираем порт
			port = await navigator.serial.requestPort(); //выбираем порт
			await port.open(settings); //настройки
			for(let i in links.click){
				links.click[i].style.opacity=1;
			}
			writer = port.writable.getWriter(); //функция записи в порт
			aa= new MyClass(writer); //параметр - функция отправки сообщения
			const reader = port.readable.getReader();
			while (true) { //слушаем порт
				let { value, done } = await reader.read();
				if (done) {
					reader.releaseLock();
					break;
				}
				aa.listener.call(aa, value)//вызов функции чтения из порта
			}
		})();		
	},

	skud(data, comment){
		pole.innerText=data+"\r\n"+(+new Date()-t_start);
		t_start=+new Date();
		console.log("skud -1 "+data[0]);
		if(data[0] in controllers){
			console.log("skud 1");
			if(data[4]&0x1F){//ТМ
				//по адресу находим объект контроллера
				//в этот объект вставляем экземпляр генератора open_door
				//если есть карта, добавляем ее номер в объект cards
				console.log("new skud");
				if(data[0] in controllers){
					controllers[data[0]].open_door=open_door();
					controllers[data[0]].open_door.next();
				}
			}else{
				console.log("skud 2");
				controllers[data[0]].open_door.next();
			}
			if(data[4]&0x10){//DOOR	
			}
		}
	},
	finder(data, comment){ //если ответ есть, добавляем адрес в массив
		if(data[0]){
			if(!(data[0] in controllers)){
				controllers[data[0]]={address:data[0]};
				controllers[data[0]].open_door=return_null();//заглушка
			}
		}
	},
};



function start(){
	list=document.querySelectorAll('div[data-click]');
	for(let i=0; i<list.length; i++){
		links.click[list[i].dataset.click]=list[i];
	}
	links.click["recovery"].style.opacity=1;
}

//let buffer = new Uint8Array([0x02, 0x04, 0x00, 0x00, 0x00, 0x05]);
function getCRC(buffer){
	let crc = new Uint16Array([0xffff]);
	let n = buffer.byteLength;
	//let crc = 0xffff;
	let c_summ=0;
	for(j=0;j<n;j++){
		//crc ^= *p++;
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
}
//let msg=control.buff_sum([buffer, getCRC(buffer)]);
//console.log(msg);

let link_window_all=document.querySelector('body');
link_window_all.addEventListener('click', links.call_func);  
link_window_all.addEventListener("change", links.call_func_chng);
start();