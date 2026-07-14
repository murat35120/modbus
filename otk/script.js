let abonent={
	key:'',
	session:'',	
	domain:'',
	port:'',
	run:1,
	ask:0,
	find:0,
	address:0,//адрес текущего контроллера для ручных команд
};
let controllers={};  //список объектов найденных контроллеров по сетевым адресам
let aa; //хранение экземпляра new MyClass - соответствует конвертеру, в данном случае он один, по этому это не массив
let t_start;  //отладочная переменная для измерения времени ответа
let ppo=5;//пауза после ответа контроллера
let twa=100;//время ожидания ответа
let tro=0;//время получения ответа
let cnt=0;//count pic/sec

class MyClass { //задача очереди: создать и добавить генераторы,по очереди перебирать их
	constructor(writer) {
		this.writer = writer; //функция через которую отправляем сообщения
	}
	queue=new Set(); //очередь
	done=true; //текущее состояние очереди
	iterator={}; //итератор
	buffer={}; //текущая команда
	timer; //указатель на текущий таймер ответа - для перехода в случае не ответа
	listener(data) {//получатель ответных сообщений
		//cnt=cnt+1;
		clearTimeout(aa.timer);

		if(this.buffer){
			this.buffer.next(data);
		} else {
			console.log("no command in buffer");
		}
	}
	add(func,  data, writer, comment) {//функция добавления в очередь
		let gen=func.call(this, data, writer, comment);//this, контекст вызова
		//let step={gen, callback};
		if(this.done){
			this.queue.clear(); //очистили очередь
			this.queue.add(gen); //добавили команду в очередь
			this.iterator = this.queue[Symbol.iterator](); //итератор для очереди
			let result=this.iterator.next(); //сделали шаг и сохранили результат, для последующих проверок
			this.done=result.done; 
			this.buffer=result.value;
			this.buffer.next();//запустили команду в буфере
		}else{
			this.queue.add(gen);
		}
	}
	next(comment) { //шаг в очереди
		if(comment){
			control.writer(comment); //пишем в окно
		}
		let result=this.iterator.next();
		this.done=result.done;
		this.buffer=result.value;
		if(!this.done){
			this.buffer.next();
		}else{
			if(abonent.ask){//старт нового цикла сканирования
				control.sk();
			}
			if(abonent.find){
				control.fnd();//старт нового цикла поиска
			}
		}
	}
}

setInterval(()=>{
		if(cnt>10){
			console.log(cnt); 
			cnt=0;
		}
	},1000);



function reset (){
	let link=document.querySelector('div[data-click="ask"]');
	if(link.dataset.in==1){
		//if(cnt==0){
		//	control.ask(link);
		//	setTimeout(()=>control.ask(link), 5000);
		//	console.log('reset');
		//}
	}
}

function *gen(data, writer, comment){ //команда с переходом по времени выводом результата в окно
	let txt=new Uint8Array(0);
	this.writer.write(data); //отправляем подготовленное сообщение
	let timer=setTimeout(()=>{control[writer]( txt, comment); this.next();cnt=cnt+1;}, twa); //this.next - метод объекта аа
	t_start=+new Date();
	let answer = yield; //получаем ответ от устройства
	while(true) {
		txt = control.buff_sum([txt, answer]);
		if(links.click.show_log.dataset.in=='1'){
			console.log(new Date());
			console.log(txt);
		}
		if(txt.length>=17){
			clearTimeout(timer);
			//tro=tro-(tro-(new Date()-t_start))/10;
			//if(links.click.show_log.dataset.in=='1'){
			//	console.log(new Date());
			//	console.log(txt);
			//}
			let timer1=setTimeout(()=>{control[writer]( txt, comment); this.next();cnt=cnt+1;}, ppo);//отправляем новый запрос через ppo = паузу после получения отвера
		}else{		
			if(txt.length==13){
				if(txt[1]==1){
					clearTimeout(timer);
					if(links.click.show_log.dataset.in=='1'){
						console.log(new Date());
						console.log(txt);
					}
					let timer1=setTimeout(()=>{control[writer]( txt, comment); this.next();cnt=cnt+1;}, ppo);
				}
			}
			if(txt.length==8){
				if(txt[1]==6||txt[3]==16){
					clearTimeout(timer);
					if(links.click.show_log.dataset.in=='1'){
						console.log(new Date());
						console.log(txt);
					}
					let timer1=setTimeout(()=>{control[writer]( txt, comment); this.next();cnt=cnt+1;}, ppo);
				}
			}
		}
		answer = yield;
	}
}


function *scan(data, writer, comment){ //команда с переходом по команде вложенной функции
	let txt=new Uint8Array(0);
	this.writer.write(data); //отправляем подготовленное сообщение
	if(links.click.show_log.dataset.in=='1'){
		//console.log(new Date());
		//console.log(data);
	}
	let timer=setTimeout(()=>{this.next();cnt=cnt+1;}, twa);
	let answer = yield; //получаем ответ от устройства
	while(true) {
		txt = control.buff_sum([txt, answer]);
		if(txt.length>=13){
			clearTimeout(timer);
			if(links.click.show_log.dataset.in=='1'){
				console.log(new Date());
				console.log(data);
			}
			yield *read(txt, comment);
		}
		answer = yield;
	}
}

function *cmd(data, writer, comment){ //команда с переходом по команде вложенной функции
	let txt=new Uint8Array(0);
	this.writer.write(data); //отправляем подготовленное сообщение
	let timer=setTimeout(()=>{this.next();cnt=cnt+1;}, twa);
	//console.log(data);
	let answer = yield; //получаем ответ от устройства
	while(true) {
		txt = control.buff_sum([txt, answer]);
		//console.log(txt);
		if(txt.length>=8){
			clearTimeout(timer);
			if(links.click.show_log.dataset.in=='1'){
				console.log(new Date());
				console.log(data);
			}
			yield *read(txt, comment);
		}
		
		answer = yield;
	}
}

function *read(data, comment){ //команда обработки событий СКУД
	if(data){
		let indication=0;
		pole.innerText=data.subarray(0,15);//data+"\r\n";
		if(data.length>=17){
			a_door.innerText=data.subarray(11,12);
			a_led.innerText=data.subarray(12,13);
			a_zp.innerText=data.subarray(13,14);
			a_12v.innerText=data.subarray(14,15);
		}
		if(data[0] in controllers){
			//a_info.innerText="";
			if(data[4]&32){//DOOR
				a_info.innerText="open DOOR";
			}
			if(!(data[3]&8)){
			//if(0){
				controllers[data[0]].lock=0;
				if(data[4]==1){//TM
					a_info.innerText= "TM down";
					open_ind(data[0], 0xff);
				}
				if(data[4]==2){//TM
					console.log("TM read "+data.subarray(5,11));
					add_card(data);
					open_ind(data[0], 0xff);
				}
				if(data[4]==4){//BUTTON
					a_info.innerText="BUTTON down";
					open_ind(data[0], 0xff);
				}
				if(data[4]==8){//BUTTON
					console.log("BUTTON read "+data.subarray(5,11));
					add_card(data);
					open_ind(data[0], 0xff);
				}
				if(data[4]==16){//INTERNAL READER
					console.log("INTERNAL read "+data.subarray(5,11));
					add_card(data);
					open_ind(data[0], 0xff);
				}
			}else{
				//делаем пик-пик
				a_info.innerText="LOCK opend"; 
				controllers[data[0]].lock=1;
			}
			
		}
	}
	timer=setTimeout(()=>{aa.next();}, ppo);
	yield 0;
}

function open_ind(addr, intr){
		control.open_lock(addr, intr);
		controllers[addr].sound.next(1);
		controllers[addr].green.next(1);
		controllers[addr].red.next(1);
}

function *indications(obj, canel, puls, pause){
	let interval=puls*128/1000;
	let flg=0;
	while(true) {
		if(obj.lock||flg){
			control[canel](obj.address, interval);
			setTimeout(()=>{obj[canel].next();}, pause+puls);
		}
		flg=yield;
	}
}

function add_card(data){ //пополняем список карт
	let card=data.subarray(5,11).join(' ');
	if(!(card in cards)){
		cards[card]={number:card};
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
	show_log(link){
		if(link.dataset.in==1){
			link.dataset.in=0;
		}else{
			link.dataset.in=1;
		}
	},
	sk(){
		for (let value in controllers) {
			let adr = new Uint8Array([value, 0x04, 0x00, 0x00, 0x00, 0x05]); //опрос первого адреса
			let data = control.buff_sum([adr, getCRC(adr)]);
			aa.add(scan, data, "skud", "ask","");//"skud" - игнорируется
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
		for(i=0; i<10; i++){
			let adr = new Uint8Array([i, 0x04, 0x00, 0x00, 0x00, 0x05]); //опрос
			let data = control.buff_sum([adr, getCRC(adr)]);
			aa.add(gen, data, "finder", "find",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
		}
		//t_start=+new Date();
	},
	groop(){
		control.open_lock(abonent.address);
		control.green(abonent.address);
		control.red(abonent.address);
		control.sound(abonent.address);
	},
	open_lock(addess, interval=0xff){
		if(typeof addess=="object"){addess=abonent.address;}
		let adr = new Uint8Array([addess, 0x06, 0x00, 0x04, 0x00, interval]); //открытие замка
		let data = control.buff_sum([adr, getCRC(adr)]);
		aa.add(cmd, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
	},
	green(addess, interval=0xff){
		if(typeof addess=="object"){addess=abonent.address;}
		let adr = new Uint8Array([addess, 0x06, 0x00, 0x01, 0x00, interval]); //зеленый - контакт LED
		let data = control.buff_sum([adr, getCRC(adr)]);
		aa.add(cmd, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
	},
	red(addess, interval=0xff){
		if(typeof addess=="object"){addess=abonent.address;}
		let adr = new Uint8Array([addess, 0x06, 0x00, 0x02, 0x00, interval]); //красный - контакт ZUMM
		let data = control.buff_sum([adr, getCRC(adr)]);
		//console.log(data);
		aa.add(cmd, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
	},
	sound(addess, interval=0xff){
		if(typeof addess=="object"){addess=abonent.address;}
		let adr = new Uint8Array([addess, 0x06, 0x00, 0x03, 0x00, interval]); //звук - звук контроллера
		let data = control.buff_sum([adr, getCRC(adr)]);
		aa.add(cmd, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
	},
	d0(addess, interval=0xff){
		if(typeof addess=="object"){addess=abonent.address;}
		let adr = new Uint8Array([addess, 0x06, 0x00, 0x05, 0x00, interval]); //зеленый
		let data = control.buff_sum([adr, getCRC(adr)]);
		aa.add(cmd, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
	},
	d1(addess, interval=0xff){
		if(typeof addess=="object"){addess=abonent.address;}
		let adr = new Uint8Array([addess, 0x06, 0x00, 0x06, 0x00, interval]); //зеленый
		let data = control.buff_sum([adr, getCRC(adr)]);
		aa.add(cmd, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
	},
	read(addess){
		if(typeof addess=="object"){addess=abonent.address;}
		let adr = new Uint8Array([addess, 0x04, 0x00, 0x00, 0x00, 0x05]); //опрос
		let data = control.buff_sum([adr, getCRC(adr)]);
		aa.add(scan, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
	},
	new_addess(old_adr, new_ard=2){
		new_ard=port_num.value;
		if(typeof old_adr=="object"){old_adr=abonent.address;}
		let adr = new Uint8Array([old_adr, 0x06, 0x00, 0x10, new_ard, new_ard]); //смена адреса,  - повтор адреса для защиты от ошибок
		let data = control.buff_sum([adr, getCRC(adr)]);
		//console.log(data);
		aa.add(gen, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
	},
	get_info(network_address){
		if(typeof network_address=="object"){network_address=abonent.address;}
		let adr = new Uint8Array([network_address, 0x01, 0x00, 0x00, 0x00, 0x05]); //инфо о контроллере
		let data = control.buff_sum([adr, getCRC(adr)]);
		//console.log(data);
		aa.add(gen, data, "finder", "info",""); //func,  data, writer, comment, callback) {//функция добавления в очередь
		let txt="";
		for(let i in controllers[abonent.address]){
			if(typeof controllers[abonent.address][i] !='object'){
				txt=txt+i+" - "+controllers[abonent.address][i]+", ";
			}
		}
		setTimeout(()=>{a_info.innerText=txt;}, 50);
	},	
	recovery(link){ //подключение (выбор) ком порта (канал ввода вывода)
		let filters = [
			{ usbVendorId: 8580, usbProductId: 17 }
		];
		let settings = {
			baudRate: 38400,
			//baudRate: 115200,
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
			let txt=new Uint8Array(0);
			while (true) { //слушаем порт
				let { value, done } = await reader.read();
				if (done) {
					reader.releaseLock();
					break;
				}
				aa.listener.call(aa, value);//вызов функции чтения из порта
			}
		})();		
	},
	finder(data, comment){ //если ответ есть, добавляем адрес в список
		if(data[1]){
			if(!(data[0] in controllers)){
				controllers[data[0]]={address:data[0]}; //добавляем в список
				control.get_info(data[0]); //получаем информацию о новом контроллере
			} else{
				if(data[1]==1){//получаем информацию о новом контроллере
					controllers[data[0]].type=data[3];
					controllers[data[0]].fw=data[4]+" "+data[5];
					controllers[data[0]].sn=256*data[10]+data[9];
					dubl_type_number(data[0], controllers[data[0]].type, controllers[data[0]].sn);//удаляем повторения типа и серийного номера
					controllers[data[0]].sound=indications(controllers[data[0]], "sound", 300, 700);
					controllers[data[0]].green=indications(controllers[data[0]], "green", 250, 250);
					controllers[data[0]].red=indications(controllers[data[0]], "red", 200, 200);
					controllers[data[0]].red.next();
					controllers[data[0]].sound.next();
					controllers[data[0]].green.next();
					if(data[0]<=1){
						control.new_addess(data[0], max_addess()); //(old_adr, new_ard)
					}
					control.controllers_button(data[0]);
				}
			}
			pole.innerText=data.subarray(0,11);//data;
		}
	},
	controllers_button(num){
		controllers_area.innerHTML="";
		for(let i in controllers){
			let div = document.createElement('div');
			div.title = controllers[i].sn;
			div.innerText = i;
			div.dataset.click="num";
			controllers_area.append(div);
			if(i==num){
				abonent.address=num;
				div.dataset.chose=1;
			}
		}
	},
	num(blk){
		abonent.address=blk.innerText;
		control.dell_chouse();
		blk.dataset.chose=1;
	},
	dell_chouse(){
		let list=controllers_area.querySelectorAll('div');
		for(let i=0; i<list.length; i++){
			list[i].dataset.chose=0;
		}
	}
};

function max_addess(){
	let max_i=1;
	for(let i in controllers){
		if(max_i<=i){
			max_i=i;
		}
	}
	return max_i+1;
}
function dubl_type_number(adr, type, sn){
	for(let i in controllers){
		if(controllers[i].type==type&&controllers[i].sn==sn){
			if(i!=adr){
				delete controllers[i];
			}
		}
	}
}

function start(){
	list=document.querySelectorAll('div[data-click]');
	for(let i=0; i<list.length; i++){
		links.click[list[i].dataset.click]=list[i];
	}
	links.click["recovery"].style.opacity=1;
}

function getCRC(buffer){
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
}

let controllers_area=document.querySelector('div[data-block="controllers"]');
let link_window_all=document.querySelector('body');
link_window_all.addEventListener('click', links.call_func);  
link_window_all.addEventListener("change", links.call_func_chng);
start();