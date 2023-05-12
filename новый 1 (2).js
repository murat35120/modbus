let qq=1;
function *gen(){ 
	let answer=1;
	let step=0;
	while(true) {
		step++;
		console.log(step);
		answer = yield 1;
		if(step>2){
			step=0;
			answer = yield *gen1(answer);
		}
	}
}
function *gen1(answer){ 
let aa=0;
	if(aa==0){
		console.log(10);
		aa=2;
		answer = yield 1;
	}
	if(aa==2){
		console.log(20);
		answer = yield *gen2(answer);
		aa=3;
	}
	if(aa==3){
		console.log(30);
		answer = yield 3;
	}
	console.log("end");
	yield "end";
}

function *gen2(answer){ 
	console.log(answer);
	answer = yield 21;
	console.log(answer);
	answer = yield 22;
	console.log(answer);
	answer = yield 23;
}
asd=gen();
function vv(){
	qq++;
	asd.next(qq);
}
vv();

function *gen3(asd){ 
	console.log(1);
	let timer=setTimeout(()=>{asd.aa.next();}, 2000)
	yield ;
	console.log(2);
	timer=setTimeout(()=>{asd.aa.next();}, 2000)
	yield ;
	console.log(3);
	timer=setTimeout(()=>{asd.aa.next();}, 2000)
	yield ;
	console.log(4);
}
let asd={};
asd.aa=gen3(asd);
asd.aa.next();
