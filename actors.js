import * as THREE from 'three';
import {
ROADS,clamp,distance,angleDifference,seededRandom
} from './world.js';
const SPECS={
sports:{max:39,accel:14,wheelbase:2.8,color:0xd5829b},
sedan:{max:30,accel:9,wheelbase:3,color:0x83bdb2},
suv:{max:28,accel:8,wheelbase:3.2,color:0xcebc99},
motorcycle:{max:36,accel:16,wheelbase:2.2,color:0x83c4ce},
taxi:{max:31,accel:10,wheelbase:3,color:0xe3bd55},
police:{max:34,accel:12,wheelbase:3,color:0xe0e1d7},
van:{max:28,accel:8,wheelbase:3.5,color:0x809eae}
};
function box(group,material,x,y,z,w,h,d) {
const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
mesh.position.set(x,y,z);
mesh.castShadow=true;
mesh.receiveShadow=true;
group.add(mesh);
return mesh;
}
export class Vehicle {
constructor(scene,id,type,x,z,yaw=0) {
this.id=id;
this.type=type;
this.spec=SPECS[type];
this.x=x;this.z=z;this.yaw=yaw;
this.speed=0;this.steer=0;this.health=100;
this.ai=false;this.from=0;this.to=1;
this.radius=type==='motorcycle'?.62:1.18;
this.hitCooldown=0;
this.headlights=false;
this.doorTimer=0;
this.braking=false;
this.stuck=0;
this.group=new THREE.Group();
scene.add(this.group);
this.paint=new THREE.MeshStandardMaterial({
color:this.spec.color,metalness:.45,roughness:.28
});
const dark=new THREE.MeshStandardMaterial({
color:0x14212a,roughness:.7
});
const chrome=new THREE.MeshStandardMaterial({
color:0xa7b1b4,metalness:.8,roughness:.22
});
const glass=new THREE.MeshStandardMaterial({
color:0x9fbcc8,transparent:true,opacity:.12,
depthWrite:false,roughness:.12,metalness:.25
});
const rubber=new THREE.MeshStandardMaterial({
color:0x11171c,roughness:1
});
const bike=type==='motorcycle';
const low=type==='sports'?.18:0;
this.eyeHeight=bike?1.55:1.6-low;
this.eyeSide=bike?0:.36;
this.eyeForward=.43;
if(bike) {
box(this.group,this.paint,0,.8,0,.48,.6,1.5);
box(this.group,dark,0,1.16,-.3,.52,.12,.8);
box(this.group,chrome,0,1.24,.66,1,.06,.06);
} else {
box(this.group,this.paint,0,.68,0,1.85,.66,3.9);
box(this.group,this.paint,0,1.95-low,-.03,1.78,.12,1.8);
box(this.group,dark,0,1.12-low,.82,1.65,.16,.35);
for(const x of [-.83,.83])for(const z of [-.86,.8])
box(this.group,this.paint,x,1.51-low,z,.08,.83,.08);
box(this.group,glass,0,1.5-low,.84,1.6,.72,.025);
box(this.group,glass,0,1.5-low,-.9,1.6,.72,.025);
for(const x of [-.88,.88])
box(this.group,glass,x,1.51-low,-.03,.025,.72,1.65);
box(this.group,chrome,0,.47,2,1.8,.14,.12);
box(this.group,chrome,0,.47,-2,1.8,.14,.12);
if(type==='van')
box(this.group,this.paint,0,1.45,-1.22,1.88,1.55,1.5);
if(type==='suv')
box(this.group,dark,0,2.06,-.1,1.5,.08,1.7);
if(type==='taxi')
box(this.group,new THREE.MeshBasicMaterial({
color:0xf7de99
}),0,2.1,0,.75,.22,.35);
if(type==='police') {
box(this.group,dark,0,.75,.1,1.87,.35,1.5);
this.red=new THREE.MeshBasicMaterial({color:0x582539});
this.blue=new THREE.MeshBasicMaterial({color:0x244572});
box(this.group,this.red,-.36,2.06,0,.55,.16,.3);
box(this.group,this.blue,.36,2.06,0,.55,.16,.3);
}
const wheel=new THREE.Mesh(
new THREE.TorusGeometry(.21,.028,6,18),dark
);
wheel.position.set(.36,1.25-low,.64);
wheel.rotation.x=-.45;
this.group.add(wheel);
}
this.headMaterial=new THREE.MeshStandardMaterial({
color:0xf1e9cc,emissive:0xffe3ae,emissiveIntensity:.1
});
this.tailMaterial=new THREE.MeshStandardMaterial({
color:0x9a304e,emissive:0xff3051,emissiveIntensity:.1
});
for(const x of bike?[0]:[-.61,.61]) {
box(this.group,this.headMaterial,x,.85,bike?1:1.97,.4,.18,.06);
box(this.group,this.tailMaterial,x,.77,bike?-1:-1.97,.32,.16,.06);
}
this.wheels=[];
for(const z of bike?[-.82,.82]:[-1.21,1.21])
for(const x of bike?[0]:[-.94,.94]) {
const pivot=new THREE.Group();
pivot.position.set(x,.39,z);
const wheel=new THREE.Mesh(
new THREE.CylinderGeometry(.39,.39,bike?.18:.23,12),
rubber
);
wheel.rotation.z=Math.PI/2;
pivot.add(wheel);
this.group.add(pivot);
this.wheels.push({pivot,wheel,front:z>0});
}
this.door=new THREE.Group();
this.door.position.set(.95,0,.68);
if(!bike)
box(this.door,this.paint,0,.85,-.5,.045,.32,1);
this.group.add(this.door);
this.visual(0,0,0,false);
}
obstacle(world,x,z) {
if(world.blocked(x,z,this.radius,0,1.95))return true;
if(this.type==='motorcycle')return false;
for(const side of [-1,1]) {
if(world.blocked(
x+Math.sin(this.yaw)*1.25*side,
z+Math.cos(this.yaw)*1.25*side,
.63,0,1.8
))return true;
}
return false;
}
move(dt,world,throttle,steering,brake,wet) {
this.hitCooldown=Math.max(0,this.hitCooldown-dt);
this.steer=THREE.MathUtils.damp(this.steer,steering*.44,6,dt);
const oldSpeed=this.speed;
if(brake) {
this.speed=THREE.MathUtils.damp(this.speed,0,4,dt);
} else {
let acceleration=throttle*this.spec.accel;
if(throttle&&Math.sign(throttle)!==Math.sign(this.speed)&&Math.abs(this.speed)>1)
acceleration*=2.6;
this.speed+=acceleration*dt;
if(!throttle)
this.speed=THREE.MathUtils.damp(this.speed,0,.65,dt);
this.speed=clamp(
this.speed,-8,this.spec.max*(.45+this.health*.0055)
);
}
this.yaw+=
this.speed/this.spec.wheelbase*Math.tan(this.steer)*
dt*(1-wet*.32);
const x=this.x+Math.sin(this.yaw)*this.speed*dt;
const z=this.z+Math.cos(this.yaw)*this.speed*dt;
let impact=0;
if(!this.obstacle(world,x,z)) {
this.x=x;this.z=z;
} else {
impact=Math.abs(this.speed);
this.speed*=-.13;
if(this.hitCooldown<=0&&impact>4) {
this.health=Math.max(0,this.health-impact*.8);
this.hitCooldown=.7;
} else impact=0;
}
this.braking=brake||Math.abs(this.speed)<Math.abs(oldSpeed)-.04;
return impact;
}
visual(dt,night,time,pursuing) {
this.group.position.set(
this.x,
Math.sin(time*10+this.id)*Math.min(.025,Math.abs(this.speed)*.0012),
this.z
);
this.group.rotation.set(0,this.yaw,-this.steer*this.speed*.0035);
this.paint.color.setHex(this.spec.color)
.multiplyScalar(.6+this.health*.004);
this.headMaterial.emissiveIntensity=
this.headlights||night>.4?2.5:.08;
this.tailMaterial.emissiveIntensity=
this.braking?3:.12+night*.45;
for(const w of this.wheels) {
w.wheel.rotation.x+=this.speed*dt/.39;
w.pivot.rotation.y=w.front?this.steer:0;
}
this.doorTimer=Math.max(0,this.doorTimer-dt);
this.door.rotation.y=
Math.sin(clamp(this.doorTimer/.7,0,1)*Math.PI);
if(this.red) {
this.red.color.setHex(
pursuing&&Math.sin(time*13)>0?0xff718c:0x582539
);
this.blue.color.setHex(
pursuing&&Math.sin(time*13)<0?0x85c4ff:0x244572
);
}
}
snapshot() {
return {
id:this.id,type:this.type,x:this.x,z:this.z,yaw:this.yaw,
health:this.health,ai:this.ai,from:this.from,to:this.to,
headlights:this.headlights
};
}
restore(s) {
Object.assign(this,s);
this.speed=0;this.steer=0;this.stuck=0;
this.hitCooldown=0;this.doorTimer=0;
this.visual(0,0,0,false);
}
}
export class Actors {
constructor(scene,world) {
this.scene=scene;
this.world=world;
this.random=seededRandom(8172);
this.vehicles=[];
this.pedestrians=[];
this.heat=0;this.unseen=0;this.bust=0;this.detected=false;
this.lastKnown={x:0,z:0};
this.collisionCooldown=0;
this.nodes=[];
for(let z=0;z<5;z++)for(let x=0;x<5;x++)
this.nodes.push({id:z*5+x,ix:x,iz:z,x:ROADS[x],z:ROADS[z]});
this.delivery=this.spawn('van',3,30,Math.PI);
this.taxi=this.spawn('taxi',3,44,Math.PI);
this.spawn('sports',-3,30,0);
this.spawn('sedan',-3,44,0);
this.spawn('motorcycle',10,38,Math.PI);
this.spawn('suv',63,25,Math.PI);
this.spawn('police',-117,-30,Math.PI);
for(let i=0;i<18;i++) {
const type=i>=15?'police':['sedan','taxi','suv','sports','van'][i%5];
let from,to,q,yaw;
for(let attempt=0;attempt<100;attempt++) {
from=Math.floor(this.random()*25);
const neighbors=this.neighbors(from);
to=neighbors[Math.floor(this.random()*neighbors.length)];
const a=this.nodes[from],b=this.nodes[to];
const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
const t=.2+this.random()*.6;
q={x:a.x+dx*t-dz/len*3,z:a.z+dz*t+dx/len*3};
yaw=Math.atan2(dx,dz);
if(!this.vehicles.some(v=>distance(v,q)<8))break;
}
const v=this.spawn(type,q.x,q.z,yaw);
v.ai=true;v.from=from;v.to=to;v.speed=8;
}
this.createPedestrians();
this.initial=this.snapshot();
}
spawn(type,x,z,yaw) {
const v=new Vehicle(this.scene,this.vehicles.length,type,x,z,yaw);
this.vehicles.push(v);
return v;
}
neighbors(id) {
const n=this.nodes[id],result=[];
if(n.ix>0)result.push(id-1);
if(n.ix<4)result.push(id+1);
if(n.iz>0)result.push(id-5);
if(n.iz<4)result.push(id+5);
return result;
}
laneTarget(v) {
const a=this.nodes[v.from],b=this.nodes[v.to];
const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
return {
x:b.x-dz/len*3,z:b.z+dx/len*3,
axis:dx?1:0
};
}
crime(amount,game) {
const previous=Math.ceil(this.heat);
this.heat=clamp(this.heat+amount,0,3);
this.unseen=0;
if(Math.ceil(this.heat)>previous)
game.ui.toast('HEAT INCREASED · Coastal patrol alerted',4);
}
createPedestrians() {
const skin=[0xc88c6d,0xe0b38b,0x956b53,0x704c3c];
const shirts=[0xd998b1,0x93c8b3,0xe5cc8c,0x94adcc,0xd9d4c5];
for(let i=0;i<40;i++) {
const vertical=i%2===0;
const road=ROADS[i%5];
const along=-130+this.random()*260;
const side=i%4<2?1:-1;
const p={
id:`ped${i}`,type:'ped',
x:vertical?road+side*9.8:along,
z:vertical?along:road+side*9.8,
vertical,dir:this.random()<.5?-1:1,
speed:.75+this.random()*.5,
phase:this.random()*6,panic:0,pause:0,cooldown:0,
label:'Talk to resident'
};
p.home={x:p.x,z:p.z};
p.group=new THREE.Group();
const cloth=new THREE.MeshStandardMaterial({color:shirts[i%5]});
const flesh=new THREE.MeshStandardMaterial({color:skin[i%4]});
const trousers=new THREE.MeshStandardMaterial({color:0x293b47});
box(p.group,cloth,0,1.03,0,.43,.62,.25);
const head=new THREE.Mesh(new THREE.SphereGeometry(.18,7,6),flesh);
head.position.y=1.52;
p.group.add(head);
p.legs=[];p.arms=[];
for(const side of [-1,1]) {
p.legs.push(box(p.group,trousers,side*.12,.37,0,.16,.73,.18));
p.arms.push(box(p.group,flesh,side*.29,1.03,0,.12,.6,.12));
}
this.scene.add(p.group);
this.pedestrians.push(p);
}
}
traffic(v,dt,game) {
let target=this.laneTarget(v);
let d=distance(v,target);
if(d<5.5) {
const previous=v.from;
v.from=v.to;
let candidates=this.neighbors(v.from).filter(n=>n!==previous);
if(!candidates.length)candidates=[previous];
if(v.type==='police'&&this.heat>.05) {
candidates.sort((a,b)=>
distance(this.nodes[a],game.player)-distance(this.nodes[b],game.player)
);
v.to=candidates[0];
} else {
v.to=candidates[Math.floor(this.random()*candidates.length)];
}
target=this.laneTarget(v);
d=distance(v,target);
}
const pursuit=v.type==='police'&&this.heat>.05;
if(pursuit&&distance(v,game.player)<23&&
this.world.clearLine(v,game.player,1.2)) {
target={x:game.player.x,z:game.player.z,axis:target.axis};
}
const desired=Math.atan2(target.x-v.x,target.z-v.z);
const error=angleDifference(desired,v.yaw);
let wanted=(pursuit?19:10+(v.id%4))*(
1-Math.min(.75,Math.abs(error)*.55)
);
if(!pursuit&&!game.time.green(target.axis)&&d<13&&d>5)
wanted=0;
const fx=Math.sin(v.yaw),fz=Math.cos(v.yaw);
for(const other of this.vehicles) {
if(other===v)continue;
const dx=other.x-v.x,dz=other.z-v.z;
const forward=dx*fx+dz*fz;
const lateral=Math.abs(dx*fz-dz*fx);
if(forward>0&&forward<10&&lateral<2.1)
wanted=Math.min(wanted,Math.max(0,(forward-4.5)*1.6));
}
if(!game.player.vehicle) {
const dx=game.player.x-v.x,dz=game.player.z-v.z;
if(dx*fx+dz*fz>0&&dx*fx+dz*fz<9&&Math.abs(dx*fz-dz*fx)<2)
wanted=0;
}
v.move(
dt,this.world,v.speed<wanted-.5?1:0,
clamp(error*1.8,-1,1),
v.speed>wanted+.6,
game.weather.wet
);
v.stuck=Math.abs(v.speed)<.4?v.stuck+dt:0;
// Recycle stuck traffic only outside the player's nearby view.
if(v.stuck>14&&distance(v,game.player)>90) {
const a=this.nodes[v.from],b=this.nodes[v.to];
const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
const q={x:a.x+dx*.3-dz/len*3,z:a.z+dz*.3+dx/len*3};
if(!this.vehicles.some(o=>o!==v&&distance(o,q)<7)) {
v.x=q.x;v.z=q.z;v.yaw=Math.atan2(dx,dz);
v.speed=5;v.stuck=0;
}
}
}
update(dt,game) {
const p=game.player;
this.detected=false;
this.collisionCooldown=Math.max(0,this.collisionCooldown-dt);
for(const v of this.vehicles) {
if(v.ai&&v!==p.vehicle)this.traffic(v,dt,game);
if(v.type==='police'&&v!==p.vehicle&&this.heat>.01&&
p.y<3&&distance(v,p)<38&&this.world.clearLine(v,p)) {
this.detected=true;
}
v.visual(dt,game.time.night,game.time.elapsed,this.heat>.05);
v.group.visible=distance(v,p)<260||v===p.vehicle;
}
if(this.heat>.001) {
this.unseen=this.detected?0:this.unseen+dt;
if(this.detected)this.lastKnown={x:p.x,z:p.z};
if(this.unseen>6)this.heat=Math.max(0,this.heat-dt*.07);
const close=this.vehicles.some(v=>
v.type==='police'&&v!==p.vehicle&&
distance(v,p)<8&&this.world.clearLine(v,p)
);
this.bust=close&&this.detected&&(!p.vehicle||Math.abs(p.vehicle.speed)<2)
?this.bust+dt:Math.max(0,this.bust-dt*2);
if(this.bust>7){game.fail('Coastal patrol detained you.');return;}
} else {
this.heat=0;this.bust=0;this.unseen=0;
}
this.world.roadblock.visible=this.heat>=2.3;
if(p.vehicle) {
const v=p.vehicle;
for(const other of this.vehicles) {
if(other===v)continue;
const d=distance(v,other),minimum=v.radius+other.radius;
if(d>=minimum||d<.001)continue;
const dx=(v.x-other.x)/d,dz=(v.z-other.z)/d;
const impact=Math.abs(v.speed)+Math.abs(other.speed)*.35;
const x=v.x+dx*(minimum-d+.02),z=v.z+dz*(minimum-d+.02);
if(!v.obstacle(this.world,x,z)){v.x=x;v.z=z;}
v.speed*=-.12;other.speed*=.25;
if(this.collisionCooldown<=0&&impact>4) {
v.health=Math.max(0,v.health-impact*.55);
p.hurt(impact*.18,game);
this.crime(.3,game);
game.sound.hit(.15);
this.collisionCooldown=.9;
}
}
p.x=v.x;p.z=v.z;
}
for(const ped of this.pedestrians) {
const d=distance(ped,p);
ped.group.visible=d<105;
if(d>125)continue;
ped.cooldown=Math.max(0,ped.cooldown-dt);
ped.panic=Math.max(0,ped.panic-dt);
ped.pause-=dt;
const car=this.vehicles.find(v=>distance(v,ped)<6&&Math.abs(v.speed)>5);
if(car) {
ped.panic=2;
ped.dir=ped.vertical?
Math.sign(ped.z-car.z)||1:
Math.sign(ped.x-car.x)||1;
}
if(p.vehicle&&distance(p.vehicle,ped)<2&&
Math.abs(p.vehicle.speed)>4&&ped.cooldown<=0) {
ped.cooldown=5;ped.panic=4;
this.crime(.45,game);
ped.dir*=-1;
}
const along=ped.vertical?ped.z:ped.x;
const intersection=ROADS.some(r=>Math.abs(along-r)<10);
const waiting=intersection&&!game.time.green(ped.vertical?0:1)&&!ped.panic;
// Some residents rest at night; rain makes walking hurried.
const resting=game.time.night>.75&&Number(ped.id.slice(3))%5===0;
if(!waiting&&!resting&&ped.pause<0) {
const speed=ped.speed*(ped.panic?2.8:game.weather.rain>.5?1.6:1);
const delta=speed*ped.dir*dt;
const x=ped.x+(ped.vertical?0:delta);
const z=ped.z+(ped.vertical?delta:0);
if(!this.world.blocked(x,z,.25,0,1.7)) {
ped.x=x;ped.z=z;
} else ped.dir*=-1;
if(Math.abs(ped.vertical?ped.z:ped.x)>133)ped.dir*=-1;
ped.phase+=dt*speed*5;
}
if(ped.pause<-10&&this.random()<dt*.08)
ped.pause=1+this.random()*3;
ped.group.position.set(ped.x,0,ped.z);
ped.group.rotation.y=ped.vertical?
(ped.dir>0?0:Math.PI):(ped.dir>0?Math.PI/2:-Math.PI/2);
ped.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(ped.phase+i*Math.PI)*.35);
ped.arms.forEach((arm,i)=>arm.rotation.x=-Math.sin(ped.phase+i*Math.PI)*.3);
}
}
horn(game) {
game.sound.tone(175,.25,.12,'square');
for(const p of this.pedestrians)
if(distance(p,game.player)<16)p.panic=2;
}
snapshot() {
return {
vehicles:this.vehicles.map(v=>v.snapshot()),
heat:this.heat,unseen:this.unseen,
lastKnown:{...this.lastKnown}
};
}
restore(s) {
for(const saved of s.vehicles||[]) {
const v=this.vehicles[saved.id];
if(v&&v.type===saved.type)v.restore(saved);
}
this.heat=clamp(s.heat||0,0,3);
this.unseen=s.unseen||0;
this.lastKnown=s.lastKnown||{x:0,z:0};
this.bust=0;this.detected=false;this.collisionCooldown=0;
}
reset() {
this.restore(this.initial);
for(const ped of this.pedestrians) {
ped.x=ped.home.x;ped.z=ped.home.z;
ped.panic=0;ped.pause=0;ped.cooldown=0;
}
}
}
