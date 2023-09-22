let myWs = new WebSocket('ws://localhost:9090');
myWs.onopen = function () {
console.log('подключился');
};
//myWs.send(obj1);
myWs.onmessage = function (message) {
	//request.main_answer(message.data);
	console.log(message.data);
};
//myWs.close(1000,'post');

let abonent={
	session:'',	
	domain:'',
	login:''
};
let comm={
	ax_get(func, url){//стандартная функция отправки сообщения
		let req=new XMLHttpRequest();
		req.addEventListener('load', control[func]);//привязали контекст
		req.open('GET', url, true);
		req.setRequestHeader('Content-Type', 'application/json');
		req.responseType = 'text';
		req.send();
	},
	ax(form, url){//стандартная функция отправки сообщения
		let req=new XMLHttpRequest();
		req.addEventListener('load', comm.show_ax);//привязали контекст
		//req.upload;
		req.open('POST', url, true);
		//req.setRequestHeader('Content-Type', 'multipart/form-data');//'application/json');
		//req.setRequestHeader('Content-Type', 'application/json');
		//req.setRequestHeader('Content-Type', 'multipart/form-data');
		
		req.responseType = 'text';
		req.send(form);
		//req.onload=comm.err;
	},

	err(e){
		let data=e.target;
		if(data.status!=200){
			if(data.status>399){
				console.log(data.status);
			}
			if(data.response=="Wrong login or password"||data.response=="Wrong domain, session or session expired"){
				control.on_on(['first_menu', 'manual_munu', 'manual_login']);
			}
		}
	},
    show_ax(e) {//стандартная функция получения сообщения
        let data=e.target;
		let obj;
		let isValidJSON=true;
        if(data.status==200){
			try { obj=JSON.parse(data.response)} catch { isValidJSON = false };
			if(!isValidJSON){
				obj=data.response;
				
			}
			//return obj;
			console.log(data.response);
		}
    }

};

let links={ //связываем действия пользователя с функциями


    call_func (e){
        let rand=Math.floor(Math.random() * 20) +40;
        document.documentElement.style.setProperty('--position_fon', rand+'%');
        let link=e.target;
		let nodeName_patent=link.parentNode.nodeName; // таблица
		if(nodeName_patent=='TD'){
			let name=link.parentNode.parentNode.parentNode.dataset.name;
			if(name=='role_list'){ //функции по изменению
				control[name](link);
			}
		}
        name=link.dataset.click;
        if(name!='undefined'){ //функции по клику
			control[name](); 
        }
    },
    call_func_chng (e){
        let link=e.target;
        let name=link.parentNode.parentNode.parentNode.dataset.inputs;
		//let obj={};
        if(name){ //функции по изменению
			control[name](link);
			return;
        }
        name=link.parentNode.parentNode.parentNode.dataset.name_arr;
        if(name){ //функции по изменению
			//control.arr_change(link); 
			return;
        }
        name=link.dataset.id;
        if(name){ //функции по изменению
			control[name](link);
        }
    },
};

let control={
	send(){
	    let ab = new FormData();//создали объект форма
		for(let i in links.felds){
            ab.append(i, links.felds[i].value);
		}
        let file=document.querySelector('.centre>select');
        ab.append('file', myfile.files[0]);
        url='';
		comm.ax(ab, url);
	},
	sendWs(){
		console.log('click send');
	}



};

class ligth_builder{
	constructor(blocks) { // blocks - место хранения ссылок на создаваемые блоки, для всех dataset
		if(blocks){
			this.blocks=blocks;
		} else{
			this.blocks={};
		}
	}
	make(text="", parent="", id="", clss="", replace=""){//видимый текст или объект, место вставки, dataset id, dataset CSS, редактировать или заменить
		let blk = document.createElement('div');  //создали блок 
		if(id){
			blk.dataset.id=id;     //вставили новый id
			if(this.blocks['id']){
				this.blocks['id'][id]=blk;
			}else{
				this.blocks['id']={};
				this.blocks['id'][id]=blk;
			}
		}
		if(clss){
			blk.dataset.clss=clss;     //вставили новый class	
			if(this.blocks['clss']){
				this.blocks['clss'][clss]=blk;
			}else{
				this.blocks['clss']={};
				this.blocks['clss'][clss]=blk;
			}
		}
		if(text){
			blk.textContent=text;   //вставляем текст
		}
		if(replace&&parent){
			parent.innerHTML="";
		}
		if(parent){
			parent.appendChild(blk); //вставили в блок
		}else{
		//	document.body.appendChild(blk);
		}
		return blk;
	}
}
class Builder{
	constructor(blocks) {// blocks - место хранения ссылок на создаваемые блоки, для всех dataset
		if(blocks){
			this.blocks=blocks;
		} else{
			this.blocks={};
		}
	}
	make(text="", parent=""){ //в поле text массив объектов, объект описывает создаваемый блок
		if(typeof(text)=="object"){
			let parent_temp=parent;
			if(!parent){
				parent="div";
			}
			if(typeof(parent)=="string"){
				parent_temp = document.createElement(parent);
			}
			//--------------------------------------			
			let arr=[];
			for (let i=0; i<text.length; i++){
				if(!text[i].object){
					if(!text[i].tag){text[i].tag="div"}
					arr[i] = document.createElement(text[i].tag);
				}else{
					arr[i]=text[i].object; //вложение готового объекта
				}
				if(text[i].tag=="div"||!text[i].tag||text[i].tag=="button"){
					if(text[i].text){
						arr[i].innerText=text[i].text;
					}
				}
				other(text[i], arr[i], this.blocks);
				parent_temp.appendChild(arr[i]);
			}
			return parent_temp;
		}
		function other(obj_in, obj_out, blocks){
			for (let k in obj_in){
				let arr_k=k.split("_");
				switch (k) {
					case "tag":
					break;
					case "object":
					break;
					default:
					if(arr_k.length>1){
						if(arr_k[0]=="dataset"){
						if(blocks[arr_k[1]]){
								blocks[arr_k[1]][obj_in[k]]=obj_out;
							}else{
								blocks[arr_k[1]]={};
								blocks[arr_k[1]][obj_in[k]]=obj_out;
							}
						}
						if(arr_k.length==2){obj_out[arr_k[0]][arr_k[1]]=obj_in[k];}
						if(arr_k.length==3){obj_out[arr_k[0]][arr_k[1]][arr_k[2]]=obj_in[k];}
					}else{
						obj_out[k]=obj_in[k];
					}
				}
			}
		}
	}
};
class OneType extends Builder{ //однотипные блоки
	constructor(tags, set, blocks) {//tags - массив вередаваемых свойств, set - общие свойства для всех полей
		super(blocks); 		
		this.tags=tags;  
		this.set=set;
		}
	prepare(data, parent){ //в данных передаем только значения в заданном порядке указанном в tags - массив массивов
		let arr=[];  //если в данных одно значение,  скобки массива можно не ставвить.
		for(let i=0; i<data.length; i++){
			let obj={};
			if(Array.isArray(data[i])){
				for(let x=0; x<this.tags.length; x++){
					if(data[i][x]){
						obj[this.tags[x]]=data[i][x];
					}
				}
			}else{
				obj[this.tags[0]]=data[i];
			}
			for(let y in this.set){
				obj[y]=this.set[y];
			}
			arr[i]=obj;
		}
		return this.make(arr, parent);
	}
}
class ManyTypes extends Builder {
	constructor(sets, blocks) {
		super(blocks);
		this.sets=sets; //масив объектов со значениями [{tags=[], set={}}, {tags=[], set={}}, {tags=[], set={}}]
	}
		// при настройке указываем какие будут переданы свойства  для каждого поля tags=["text", "dataset_id"], 
		// общие свойства для каждого поля set={dataset_clss:"btn"}
		//в данных передаем только значения в заданном порядке [fg, ghj], [erd, tygd]
		// если в данных одно значение, можно  скобки массива не вставлять.
	prepare(data, parent){
		let arr=[];
		for(let i=0; i<data.length; i++){
			let obj={};
			if(typeof(data[i])=="object"){
				for(let x=0; x<this.sets[i].tags.length; x++){
					if(data[i][x]){
						obj[this.sets[i].tags[x]]=data[i][x];
					}
				}
			}else{
				obj[this.sets[i].tags[0]]=data[i];
			}
			for(let y in this.sets[i].set){
				obj[y]=this.sets[i].set[y];
			}
			arr[i]=obj;
		}
		return this.make(arr, parent);
	}
}

let blocks={};


let maker={
	one: new OneType(["dataset_id", "text"],{}, blocks ),
	click: new OneType(["dataset_click", "text"],{}, blocks ),
	addBlocks: new OneType(["object", "dataset_block"],{}, blocks ),
	ligth: new ligth_builder(blocks),
	many: new ManyTypes([
		{tags:["text", "dataset_id"], set:{tag:"button", dataset_btn:"tyu"}},
		{tags:["value", "dataset_id"], set:{tag:"input", dataset_btn:"tyu"}},
		{tags:["value", "dataset_id"], set:{tag:"input", type:"number", dataset_btn:"tyu"}},
		{tags:["text", "dataset_id"], set:{}},
	], blocks ),
	name_id_type: new ManyTypes([
	    {tags:["text"], set:{}},
	    {tags:["dataset_read", "type"], set:{tag:"input"}},
	    ], blocks),

};

function carcass(){
	let screen=maker.ligth.make("", document.body,"","screen");
	maker.one.prepare(['blockHeader', 'blockIn', 'main', 'footer'], screen);
	maker.one.prepare([["header", "Z-5 Modbus"], ['slogan','API управления онлайн СКУД']], blocks.id.blockHeader);
	maker.one.prepare(['loginPass', 'buttons', 'offer'], blocks.id.blockIn);
	maker.addBlocks.prepare([maker.name_id_type.prepare(['Логин', 'login']),maker.name_id_type.prepare(['Пароль', 'password'])], blocks.id.loginPass);
	maker.click.prepare([["goIn", "Вход"], ["registration", "Регистрирация"], ["sendWs", "Отправить"]], blocks.id.buttons);
	maker.click.prepare([["publickOffer", "Публичная оферта"]], blocks.id.offer);
	maker.one.prepare(["article"], blocks.id.main);
	maker.one.prepare([["headerArticle", "Основной блок"], "mainArticle", "footerArticle"], blocks.id.article);
	maker.one.prepare([["headerFoot", "Это футер"], "mainFoot", "footerFoot"], blocks.id.footer);
}


function print(data){console.log(data)}

function start(){
	carcass();
	//тут собираем всю страницу
	domain=document.location.pathname.split("/")[1];
	if(localStorage[domain]){
		abonent=JSON.parse(localStorage[domain]);
	}else{
		abonent.domain=domain;
	}
	if(abonent.session!=""){
		//авторизация на сервере по сессии
	}else{
		if(abonent.login!=""){
			//отправляю запрос проверяю логин
			//если логин есть открываем окно входа и вставляем логин, если нет  оставляю поле пустым
			//авторизация по логину или регистрация, логин/пароль - перед отправкой проверяю, что оба поля заполнены
			//если связка логин/пароль отсутствует, предлагаю вести паскей
		}else{
			//открываем окно входа
			//авторизация по логину или регистрация, логин/пароль - перед отправкой проверяю, что оба поля заполнены
			//проверяю логин, если нет предлагаю изменить
			//если связка логин/пароль отсутствует, предлагаю вести паскей
		}
	}
}



let link_window_all=document.querySelector('body');
link_window_all.addEventListener('click', links.call_func);  
link_window_all.addEventListener("change", links.call_func_chng);


start();
