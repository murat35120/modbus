let myWs = new WebSocket('ws://localhost:9090');
myWs.onopen = function () {
console.log('подключился');
	control.converters_list();
	control.controllers_list();
};
//myWs.send(obj1);
myWs.onmessage = function (message) {
	//request.main_answer(message.data);
	//console.log(message.data);
	try {
		let data = JSON.parse(message.data);
			if(data.api in ressive){
				ressive[data.api](data);
			}
        } 
	catch (e) {
		console.error(e);
	}
};
//myWs.close(1000,'post');

let abonent={
	session:'',	
	domain:'',
	login:''
};
let controllersList;
let convertersList;
let triggers={
	list:[],
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
        //let rand=Math.floor(Math.random() * 20) +40;
        //document.documentElement.style.setProperty('--position_fon', rand+'%');
        let link=e.target;
		let name=link.dataset.click;
		let node_patent=link.parentNode; //
		let call=link.dataset.call; //
		let group=link.dataset.group; //
		if(name!='undefined'){
			if(node_patent.dataset.parentgroup){
				node_patent.dataset.parentgroup=link.dataset.click;
				for(let i=0; i<node_patent.childNodes.length; i++){
					node_patent.childNodes[i].dataset.down=0;
				}
				link.dataset.down=1;
				if(call){
					if(control[call]){
						control[call](name);
					}
				}
				if(group){
					if(control.group){
						control.group(link);
					}
				}
			}else{
				if(control[name]){
					control[name](link);
				}				
			}
		}
    },
    call_func_chng (e){
        let link=e.target;
        //let name=link.parentNode.parentNode.parentNode.dataset.inputs;
		//let obj={};
        //if(name){ //функции по изменению
		//	control[name](link);
		//	return;
        //}
        //name=link.parentNode.parentNode.parentNode.dataset.name_arr;
        //if(name){ //функции по изменению
			//control.arr_change(link); 
		//	return;
        //}
        name=link.dataset.read;
        if(name){ //функции по изменению
			if(control[name]){
				control[name](link);
			}
        }
    },
};

let control={
	api_key:'1356_api',
	ask:{api_key:'1356_api'},
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
	controllers_list(){
		control.ask.api='controllers_list';
		myWs.send(JSON.stringify(control.ask));
	},
	converters_list(){
		control.ask.api='converters_list';
		myWs.send(JSON.stringify(control.ask));
	},
	cards_list(){
		control.ask.api='cards_list';
		myWs.send(JSON.stringify(control.ask));
	},
	triggers_type(){
		control.ask.api='triggers_type';
		myWs.send(JSON.stringify(control.ask));
	},
	pattern_list(controller){
		control.ask.api='pattern_list';
		control.ask.controller=controller;
		myWs.send(JSON.stringify(control.ask));
	},
	controller(number){
		blocks.id.ControllerInfo.innerHTML=''
		maker.addBlocks.prepare([maker.name_value.prepare(['type:', controllersList[number].type]), maker.name_value.prepare(['number:', controllersList[number].number]), maker.name_value.prepare(['address:', String(controllersList[number].address)])], blocks.id.ControllerInfo);
		blocks.id.triggersView.innerHTML=''
		control.triggers_show(number);
		//let arr=controllersList[number].triggers;
		//for(let i=0; i<arr.length; i++){
		//	let blk_temp= maker.addBlocks.prepare( [maker.name_value.prepare(['id:', String(i)]), maker.name_value.prepare(['type:', arr[i].type]),  maker.name_value.prepare(['sost:', String(control.sost_from_value(arr[i].sost))]), maker.click.prepare([["trigger_dell", "Удалить"]], blocks.id.offer)]);
		//	blk_temp.dataset.trigger=i;
		//	blocks.id.triggersView.appendChild(blk_temp); 
		//}
		
		control.group(blocks.click.infoColl);
	},
	triggers_show(number){
		blocks.id.triggersView.innerHTML=''
		let arr=controllersList[number].triggers;
		for(let i=0; i<arr.length; i++){
			let num=arr[i].type.indexOf('_');
			//console.log(num);
			let new_blk;
			switch(num) {
				case 1:
					//console.log("1 "+ arr[i].type + "   " + String(arr[i].bits.toString(2)).length );
					new_blk=maker.addBlocks.prepare( [maker.name_value.prepare(['id:', String(i)]), maker.name_value.prepare(['type:', arr[i].type]),  maker.name_value.prepare(['bite:', String(control.bite_from_value(arr[i].sost))]), maker.click.prepare([["trigger_dell", "Удалить"]], blocks.id.offer)] );
				break;
				case 2:
					//console.log("2 "+ arr[i].type );
					new_blk=maker.addBlocks.prepare( [maker.name_value.prepare(['id:', String(i)]), maker.name_value.prepare(['type:', arr[i].type]),  maker.name_value.prepare(['max:', String(arr[i].max)]),  maker.name_value.prepare(['min:', String(arr[i].min)]),  maker.name_value.prepare(['dev:', String(arr[i].dev)]), maker.click.prepare([["trigger_dell", "Удалить"]], blocks.id.offer)]  ); 
				break;
				default:
					//console.log("default "+ arr[i].type );
					new_blk=maker.addBlocks.prepare( [maker.name_value.prepare(['id:', String(i)]), maker.name_value.prepare(['type:', arr[i].type]),  maker.name_value.prepare(['sost:', String(control.sost_from_value(arr[i].sost))]), maker.click.prepare([["trigger_dell", "Удалить"]], blocks.id.offer)]  ); 
			}
			blocks.id.triggersView.appendChild(new_blk); 
			new_blk.dataset.trigger_id=String(i);
		}
	},
	group(link){
		if(link.dataset.group){
			let list=blocks.group;
			let val='0';
			for(let i in list){
				if(+list[i].dataset.down){
					val='1';	
				}else{
					val='0';
				}
				if(blocks.id[list[i].dataset.group]){
					blocks.id[list[i].dataset.group].dataset.display=val;
				}
			}
		}
	},
	infoColl(link){	
	},
	triggers(link){
	},
	commands(link){
	},
	setTriggers(link){	
	},
	trigger_add(controller, type, obj){
		control.ask={api_key:control.api_key};
		control.ask.api='trigger_add';
		control.ask.controller=controller;
		control.ask.type=type;
		for(i in obj){
			control.ask[i]=obj[i];
		}
		myWs.send(JSON.stringify(control.ask));
	},
	trigger_add_ind(controller, type, obj){
		control.ask={api_key:control.api_key};
		control.ask.api='trigger_add_ind';
		control.ask.controller=controller;
		control.ask.type=type;
		for(i in obj){
			control.ask[i]=obj[i];
		}
		myWs.send(JSON.stringify(control.ask));
	},
	trigger_add_sys(controller, type, obj){
		control.ask={api_key:control.api_key};
		control.ask.api='trigger_add_sys';
		control.ask.controller='37_24688';
		control.ask.type='door';
		control.ask.sost=32;
		control.ask.callback='open_for_in';
		control.ask.obj='thet';//'func_api';
		myWs.send(JSON.stringify(control.ask));
	},
	trigger_dell(link){
		control.ask={api_key:control.api_key};
		control.ask.api='trigger_dell';
		control.ask.controller=blocks.id.controllerList.dataset.parentgroup;
		control.ask.trigger_id=link.parentNode.parentNode.dataset.trigger_id  ; // тут нужно испрравить 
		
		myWs.send(JSON.stringify(control.ask));
	},
	typeSelect(link){
		maker.block_trigger_value(blocks.id.triggersValue);
	},
	sost_from_value(value){
		if((+value)>0){
				return 1;
		}else{
			return 0;
		}
	},
	addTrigger(link){
		let controller=blocks.id.controllerList.dataset.parentgroup;
		let type=blocks.read.typeSelect.value;
		let num=type.indexOf('_');
		let obj={};
		switch(num){
			case 1:
				obj.sost=control.value_from_bit(blocks.read.bit.value);
			break
			case 2:
				obj=control.max_min_dev(blocks.id.triggersValue);
			break
			default:
				//obj.sost=blocks.read.sost.value;
				obj.sost=control.value_from_sost(type, String(blocks.read.sost.value));
		}
		control.trigger_add(controller, type, obj);
	},
	value_from_sost(type, sost){
		let value=0;
		if(sost!='0'){
			value=triggers.types[type].bits;
		}
		return value;
	},
	value_from_bit(bit){
		let value=0;
		if(typeof(+bit)=='number'){
			for (let i=0; i<=(+bit-1); i++){
				value=value+2**i;
			}
		}
		return value;
	},
	bite_from_value(sost){
		let value=0;
		if(sost){
			value=String(String(sost.toString(2)).length);
		}
		return value;
	},
	max_min_dev(block){
		let obj={};
		let list=block.querySelectorAll('input');
		for(i=0; i<list.length; i++){
			obj[list[i].dataset.read]=list[i].value;
		}
		return obj;
	},
	green_cmd_test(controller, interval){ // не сделана и не проверена
		control.ask={api_key:control.api_key};
		control.ask.api='green';
		control.ask.controller=controller;
		control.ask.interval=interval;//значение в секундах
		myWs.send(JSON.stringify(control.ask));
	},
	green(link){ // не сделана и не проверена
		control.ask={api_key:control.api_key};
		control.ask.api='green';
		control.ask.controller=blocks.id.controllerList.dataset.parentgroup;
		control.ask.interval=blocks.block.green_on.children[1].value;//interval;//значение в секундах
		myWs.send(JSON.stringify(control.ask));
	},
	red(link){ // не сделана и не проверена
		control.ask={api_key:control.api_key};
		control.ask.api='red';
		control.ask.controller=blocks.id.controllerList.dataset.parentgroup;
		control.ask.interval=blocks.block.red_on.children[1].value;//interval;//значение в секундах
		myWs.send(JSON.stringify(control.ask));
	},
	sound(link){ // не сделана и не проверена
		control.ask={api_key:control.api_key};
		control.ask.api='sound';
		control.ask.controller=blocks.id.controllerList.dataset.parentgroup;
		control.ask.interval=blocks.block.sound_on.children[1].value;//interval;//значение в секундах
		myWs.send(JSON.stringify(control.ask));
	},
	d0(link){ // не сделана и не проверена
		control.ask={api_key:control.api_key};
		control.ask.api='d0';
		control.ask.controller=blocks.id.controllerList.dataset.parentgroup;
		control.ask.interval=blocks.block.d0_on.children[1].value;//interval;//значение в секундах
		myWs.send(JSON.stringify(control.ask));
	},
	d1(link){ // не сделана и не проверена
		control.ask={api_key:control.api_key};
		control.ask.api='d1';
		control.ask.controller=blocks.id.controllerList.dataset.parentgroup;
		control.ask.interval=blocks.block.d1_on.children[1].value;//interval;//значение в секундах
		myWs.send(JSON.stringify(control.ask));
	},
	lock(link){ // не сделана и не проверена
		control.ask={api_key:control.api_key};
		control.ask.api='lock';
		control.ask.controller=blocks.id.controllerList.dataset.parentgroup;
		control.ask.interval=blocks.block.lock_open.children[1].value;//interval;//значение в секундах
		myWs.send(JSON.stringify(control.ask));
	},
	new_adr(link){ // не сделана и не проверена
		control.ask={api_key:control.api_key};
		control.ask.api='new_address';
		control.ask.controller=blocks.id.controllerList.dataset.parentgroup;
		control.ask.new_adr=blocks.block.new_adr.children[1].value;//interval;//значение в секундах
		myWs.send(JSON.stringify(control.ask));
	},
};
let patern_list;
let ressive={
	controllers_list(data){
		//console.log(data.list);
		controllersList=data.list;
		blocks.id.controllerList.innerHTML='';
		for(let i in data.list){
			maker.click_call.prepare([[i, i, 'controller']], blocks.id.controllerList);
		}
		control.triggers_type();
	},
	converters_list(data){
		//console.log(data.list);
		convertersList=data.list;
	},
	cards_list(data){
		console.log(data.list);
		console.log(data.info);
	},
	pattern_list(data){
		console.log(data.pattern_list);
		patern_list=data.pattern_list;
		//console.log(data.info);
	},
	triggers_type(data){
		//console.log(data.list);
		triggers.types=data.list;
		for(let i in data.list){
			triggers.list.push([i, i]);
		}
		blocks.id.forType.innerHTML='';
		maker.name_id_list.prepare(['Тип', ['typeSelect', triggers.list, 'card_in']], blocks.id.forType);
		//console.log(triggers.list);
	},
	trigger_add(data){
		//console.log(data.triggers);
		controllersList[data.controller].triggers=data.triggers;
		control.triggers_show(data.controller);
		//triggers.types=data.list;
		//for(let i in data.list){
		//	triggers.list.push([i, i]);
		//}
		//blocks.id.forType.innerHTML='';
		//maker.name_id_list.prepare(['Тип', ['typeSelect', triggers.list, 'card_in']], blocks.id.forType);
		//console.log(triggers.list);
	},
	trigger_dell(data){
		//console.log(data.triggers);
		controllersList[data.controller].triggers=data.triggers;
		control.triggers_show(data.controller);
		//triggers.types=data.list;
		//for(let i in data.list){
		//	triggers.list.push([i, i]);
		//}
		//blocks.id.forType.innerHTML='';
		//maker.name_id_list.prepare(['Тип', ['typeSelect', triggers.list, 'card_in']], blocks.id.forType);
		//console.log(triggers.list);
	},
	trigger_info(data){
		let trigger_info = data.trigger_info;
		//console.log(trigger_info.controller+"  "+trigger_info.name+"  "+trigger_info.sost);
		//console.log(trigger_info.data.data);
		if(trigger_info){
			while(blocks.id.logWindow.childNodes.length>19){
				blocks.id.logWindow.removeChild(blocks.id.logWindow.firstChild);
			}
			maker.ligth.make(trigger_info.controller+"  "+trigger_info.name+"  "+trigger_info.sost+"  /  "+trigger_info.data.data,  blocks.id.logWindow);
		}else{
			if(data.name=='new controller'){
				control.controllers_list();
			}
		}
	},
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
				if(text[i].list&&text[i].tag=='select'){
					if(Array.isArray(text[i].list)){
						for(let j=0; j<text[i].list.length; j++ ){ 
							arr[i].appendChild(new Option(text[i].list[j][0],text[i].list[j][1],text[i].list[j][2], text[i].list[j][3]));
						}
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
					case "list":
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
	click_group: new OneType(["dataset_click", "text", "dataset_group"],{}, blocks ),
	click_call: new OneType(["dataset_click", "text", "dataset_call"],{}, blocks ),
	addBlocks: new OneType(["object", "dataset_block", "className"],{}, blocks ),
	ligth: new ligth_builder(blocks),
	name_value: new ManyTypes([
		{tags:["text"], set:{}},
		{tags:["text"], set:{}},
	], blocks ),
	nameID_value: new ManyTypes([
		{tags:["text", "dataset_click"], set:{}},
		{tags:["value"], set:{tag:"input", type:'number'}},
	], blocks ),
	name_id_type: new ManyTypes([
	    {tags:["text"], set:{}},
	    {tags:["dataset_read", "type"], set:{tag:"input"}},
	], blocks),
	name_id_max: new ManyTypes([
	    {tags:['text'], set:{}},
	    {tags:['dataset_read', 'max'], set:{tag:'input', type:'number', min:0, step:1}},
	], blocks),
	name_id_min: new ManyTypes([
	    {tags:['text'], set:{}},
	    {tags:['dataset_read', 'min'], set:{tag:'input', type:'number', max:255, step:1}},
	], blocks),
	name_id_list: new ManyTypes([
	    {tags:['text'], set:{className:'NameAndSelect alignCenter'}},
	    {tags:['dataset_read', 'list', 'value'], set:{tag:'select', className:'nameAndSelect'}},
	    ], blocks),
	block_trigger_value(block){
		block.innerHTML='';
		let type=blocks.read.typeSelect.value;
		let trigger = triggers.types[type];
		if(typeof( trigger)=='object'){
			let poz=type.indexOf('_');
			switch (poz){
				case 1:
				maker.addBlocks.prepare([[maker.name_id_max.prepare(['Бит', ['bit', 8]]),'valueTrigger']], block);
				blocks.read.bit.value=1;
				//maker.click.prepare([["trigger_dell", "X"]], blocks.id.offer);
				break
				case 2:
				maker.addBlocks.prepare([[maker.name_id_min.prepare(['Мин', ['min', -128]]),'valueTrigger'], [maker.name_id_max.prepare(['Макс', ['max', 255]]),'valueTrigger'],  [maker.name_id_max.prepare(['Дельта', ['dev', 128]]),'valueTrigger']  ], block);
				blocks.read.min.value=0;
				blocks.read.max.value=128;
				blocks.read.dev.value=10;
				break
				default:
				maker.addBlocks.prepare([[maker.name_id_max.prepare(['Состояние', ['sost', 1]]),'valueTrigger']], block);
				blocks.read.sost.value=1;
			}
			// вставляем поля с нужными ограничениями
			// используем для вставки отделные функции
			
		}
	},
	
	
};

function carcass(){
	let screen=maker.ligth.make("", document.body,"","screen");
	maker.one.prepare(['blockHeader', 'blockIn', 'main', 'footer'], screen);
	maker.one.prepare([["header", "Z-5 Modbus"], ['slogan','API управления онлайн СКУД']], blocks.id.blockHeader);
	//maker.one.prepare(['loginPass', 'buttons', 'offer'], blocks.id.blockIn);
	//maker.click.prepare([['controllers_list', 'Список контроллеров'], ['converters_list', 'Список конвертеров'], ['cards_list', 'Список карт']], blocks.id.blockIn);
	//maker.addBlocks.prepare([maker.name_id_type.prepare(['Логин', 'login']),maker.name_id_type.prepare(['Пароль', 'password'])], blocks.id.loginPass);
	//maker.click.prepare([["goIn", "Вход"], ["registration", "Регистрирация"], ["sendWs", "Отправить"]], blocks.id.buttons);
	//maker.click.prepare([["publickOffer", "Публичная оферта"]], blocks.id.offer);
	maker.one.prepare(["article"], blocks.id.main);
	maker.one.prepare(["headerArticle", "mainArticle", "footerArticle"], blocks.id.article);

	maker.one.prepare(["controllerList", "settingsWidows", "logWindow"], blocks.id.mainArticle);
	blocks.id.controllerList.dataset.parentgroup='1';
	maker.one.prepare(["settingButtons", "settings"], blocks.id.settingsWidows);
	blocks.id.settingButtons.dataset.parentgroup="infoColl";
	maker.click_group.prepare([["infoColl", "Описание", "ControllerInfo"], ["triggers", "Триггеры", "triggersList"], ["commands", "Команды", "commandsList"]], blocks.id.settingButtons);
	blocks.click.infoColl.dataset.down=1;
	maker.one.prepare(["ControllerInfo", "triggersList", "commandsList"], blocks.id.settings);
	maker.one.prepare(["triggersAdd", "triggersValue", "triggersView"], blocks.id.triggersList);
	blocks.id.triggersList.dataset.display='0';
	//maker.addBlocks.prepare([maker.name_id_type.prepare(['Тип', ['type','select']]), maker.one.prepare(['forValue']), maker.click.prepare([["triggerAdd", "Добавить"]])], blocks.id.triggersAdd);
	maker.one.prepare(["forType", "forValue"], blocks.id.triggersAdd);
	maker.name_id_list.prepare(['Тип', ['typeSelect', triggers.list, 'card_in']], blocks.id.forType);
	maker.click.prepare([["addTrigger", "добавить"]], blocks.id.triggersAdd);
	
	maker.addBlocks.prepare([[maker.nameID_value.prepare([['Зеленый', 'green'], 3]),'green_on', 'justifyBetween']],  blocks.id.commandsList);
	maker.addBlocks.prepare([ [maker.nameID_value.prepare([['Красный', 'red'], 3]),'red_on', 'justifyBetween']],  blocks.id.commandsList);
	maker.addBlocks.prepare([[ maker.nameID_value.prepare([['Замок', 'lock'], 3]),'lock_open', 'justifyBetween'] ],  blocks.id.commandsList);
	maker.addBlocks.prepare([[maker.nameID_value.prepare([['D0', 'd0'], 3]),'d0_on', 'justifyBetween'] ],  blocks.id.commandsList);
	maker.addBlocks.prepare([[maker.nameID_value.prepare([['D1', 'd1'], 3]),'d1_on', 'justifyBetween'] ],  blocks.id.commandsList);
	maker.addBlocks.prepare([[maker.nameID_value.prepare([['Новый адрес', 'new_adr'], 3]),'new_adr', 'justifyBetween'] ],  blocks.id.commandsList);
	//maker.nameID_value.prepare([['Замок', 'lock'], 3], blocks.id.commandsList);
	
	blocks.id.commandsList.dataset.display='0';
	blocks.id.commandsList.className="directionColumn justifyCenter";
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
