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



};

let builder={
	blocks:{}, //ссылки на блоки
	make(txt="", prnt="", id="", clss="", replace=""){//видимый текст или объект, место вставки, dataset id, dataset CSS, редактировать или заменить
		if(typeof(txt)=="object"){
			let prnt_temp=prnt;
			if(!prnt){
				prnt="div";
			}
			if(typeof(prnt)=="string"){
				prnt_temp = document.createElement(prnt);
			}		
			let arr=[];
			for (let i=0; i<txt.length; i++){
				if(!txt[i].blk){txt[i].blk="div"}
				arr[i] = document.createElement(txt[i].blk);
				if(txt[i].blk=="div"||!txt[i].blk){
					if(txt[i].txt){
						arr[i].innerText=txt[i].txt;
					}
				}
				this.other(txt[i], arr[i]);
				prnt_temp.appendChild(arr[i]);
			}
			return prnt_temp;
		}else{
			let blk = document.createElement('div');  //создали блок 
			if(id){
				blk.dataset.id=id;     //вставили новый id
				this.blocks[id]=blk;
			}
			if(clss){
				blk.dataset.clss=clss;     //вставили новый class	
			}
			if(txt){
				blk.textContent=txt;   //вставляем текст
			}
			if(replace&&prnt){
				prnt.innerHTML="";
			}
			if(prnt){
				prnt.appendChild(blk); //вставили в блок
			}else{
				document.body.appendChild(blk);
			}
			return blk;
		}
	},

	other(obj_in, obj_out){
		for (let k in obj_in){
			let arr_k=k.split("_");
			switch (k) {
				case "blk":
				break;
				default:
				if(arr_k.length>1){
					if(arr_k.length==2){obj_out[arr_k[0]][arr_k[1]]=obj_in[k];}
					if(arr_k.length==3){obj_out[arr_k[0]][arr_k[1]][arr_k[2]]=obj_in[k];}
				}else{
					obj_out[k]=obj_in[k];
				}
				if(k=="dataset_id"){
					this.blocks[obj_in[k]]=obj_out;
				}
			}
		}
	},
	
	
};

let bricks={
	test:"",
	menu(){
		let main_blk=builder.make("",builder.blocks.main);
		builder.make([{txt:"Menu"}, {dataset_clss:"dubl"}],main_blk);
		this.test=main_blk;
		let levels=builder.make([{dataset_clss:"login_blk"}, {dataset_clss:"login_blk"}],main_blk.lastChild);
		builder.make([{txt:"Btn1"}, {txt:"Btn2"}, {txt:"Btn3"}, {txt:"Btn4"} ], levels.firstChild);
		builder.make([{txt:"Btn5"}, {txt:"Btn6"}, {txt:"Btn7"}, {txt:"Btn8"} ], levels.lastChild);
	},
}



function start(){
	let main=builder.make("Gooo","","main","main");
	let login_block=builder.make("Hello",main);
	let log_blk=builder.make("",main);
	let pass_blk=builder.make("",main);
	builder.make([
		{txt:"login"},
		{blk:"input", value:"login", dataset_id:"login", dataset_clss:"login_blk"},
	],log_blk);
	builder.make([
		{txt:"password"},
		{blk:"input", value:"password", dataset_id:"pass", dataset_clss:"login_blk"},
	],pass_blk);

	
	
	
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