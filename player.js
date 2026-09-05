import * as THREE from 'three';
import { clamp,distance } from './world.js';
export class Player {
constructor(camera,world) {
this.camera=camera;
this.world=world;
this.sensitivity=1;
this.makePhone();
this.reset();
}
reset() {
this.x=10;this.z=30;this.y=0;
this.yaw=Math.PI;this.viewYaw=this.yaw;this.pitch=0;
this.headYaw=0;this.vehicle=null;
this.health=100;this.stamina=100;this.cash=200;
this.vy=0;this.grounded=true;this.eye=1.66;
this.bob=0;this.moving=false;this.sprinting=false;
this.phone=false;this.phoneTab=0;
this.target=null;this.shake=0;this.phoneTick=0;
this.camera.rotation.order='YXZ';
this.camera.position.set(this.x,this.eye,this.z);
}
makePhone() {
this.phoneGroup=new THREE.Group();
this.phoneGroup.position.set(.27,-.9,-.59);
this.phoneGroup.rotation.set(-.06,-.14,.04);
this.camera.add(this.phoneGroup);
const shell=new THREE.Mesh(
new THREE.BoxGeometry(.23,.415,.025),
new THREE.MeshStandardMaterial({
color:0x14212b,roughness:.3,metalness:.45,
depthTest:false,depthWrite:false
})
);
shell.renderOrder=100;
this.phoneGroup.add(shell);
this.phoneCanvas=document.createElement('canvas');
this.phoneCanvas.width=360;this.phoneCanvas.height=640;
this.phoneTexture=new THREE.CanvasTexture(this.phoneCanvas);
this.phoneTexture.colorSpace=THREE.SRGBColorSpace;
const screen=new THREE.Mesh(
new THREE.PlaneGeometry(.207,.366),
new THREE.MeshBasicMaterial({
map:this.phoneTexture,depthTest:false,depthWrite:false
})
);
screen.position.set(0,.005,.014);
screen.renderOrder=101;
this.phoneGroup.add(screen);
const hand=new THREE.Mesh(
new THREE.CapsuleGeometry(.042,.17,4,8),
new THREE.MeshStandardMaterial({
color:0xb78065,depthTest:false,depthWrite:false
})
);
hand.position.set(.102,-.2,-.005);
hand.rotation.z=-.2;hand.renderOrder=99;
this.phoneGroup.add(hand);
}
look(dx,dy) {
const amount=.002*this.sensitivity;
if(this.vehicle)
this.headYaw=clamp(this.headYaw-dx*amount,-1.4,1.4);
else this.yaw-=dx*amount;
this.pitch=clamp(this.pitch-dy*amount,-1.35,1.35);
}
hurt(amount,game) {
this.health=Math.max(0,this.health-amount);
this.shake=Math.min(1,amount/12);
game.ui.damageTimer=.4;
if(this.health<=0)game.fail('You need medical assistance.');
}
update(dt,game,keys,pressed) {
const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
const right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
this.moving=!!(forward||right);
this.sprinting=false;
this.shake=Math.max(0,this.shake-dt*2);
if(pressed.has('KeyP')) {
this.phone=!this.phone;
game.sound.tone(520,.06,.035);
}
if(this.phone)
for(let i=0;i<4;i++)
if(pressed.has(`Digit${i+1}`))this.phoneTab=i;
if(this.vehicle) {
const v=this.vehicle;
const impact=v.move(
dt,this.world,forward,-right,
keys.has('ShiftLeft')||keys.has('ShiftRight'),
game.weather.wet
);
if(impact>4) {
this.hurt(impact*.2,game);
game.sound.hit(.14);
game.actors.crime(.12,game);
}
this.x=v.x;this.z=v.z;this.y=0;
this.yaw=v.yaw;this.viewYaw=v.yaw+this.headYaw;
this.stamina=Math.min(100,this.stamina+dt*14);
if(pressed.has('KeyH'))v.headlights=!v.headlights;
if(pressed.has('Space'))game.actors.horn(game);
if(v.health<=0)game.fail('Your vehicle is disabled.');
} else {
this.viewYaw=this.yaw;
const crouching=keys.has('KeyC');
this.eye=THREE.MathUtils.damp(
this.eye,crouching?1.05:1.66,12,dt
);
this.sprinting=
(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&
this.stamina>3&&this.moving&&!crouching&&!this.phone;
let speed=crouching?2:this.sprinting?7.5:4.2;
if(this.phone)speed*=.7;
this.stamina=clamp(
this.stamina+dt*(this.sprinting?-17:12),0,100
);
if(pressed.has('Space')&&this.grounded&&!crouching) {
this.vy=6;this.grounded=false;
this.stamina=Math.max(0,this.stamina-5);
}
let dx=Math.sin(this.yaw)*forward-Math.cos(this.yaw)*right;
let dz=Math.cos(this.yaw)*forward+Math.sin(this.yaw)*right;
const length=Math.hypot(dx,dz);
if(length) {
dx=dx/length*speed*dt;
dz=dz/length*speed*dt;
}
const moveAxis=(x,z)=>{
const floor=this.world.floor(x,z);
const stepping=this.grounded&&floor>=this.y&&floor-this.y<.4;
const y=stepping?floor:this.y;
const vehicleBlocked=game.actors.vehicles.some(v=>
distance(v,{x,z})<v.radius+.3&&y<2
);
if(!vehicleBlocked&&!this.world.blocked(x,z,.32,y,this.eye)) {
this.x=x;this.z=z;
if(stepping)this.y=floor;
}
};
moveAxis(this.x+dx,this.z);
moveAxis(this.x,this.z+dz);
const previousY=this.y;
this.vy-=17*dt;
this.y+=this.vy*dt;
const floor=this.world.floor(this.x,this.z);
if(this.vy<=0&&this.y<=floor&&previousY>=floor-.4) {
if(this.vy<-12)this.hurt((-this.vy-12)*2.5,game);
this.y=floor;this.vy=0;this.grounded=true;
} else this.grounded=false;
if(this.y<-.1) {
this.y=0;this.vy=0;this.grounded=true;
}
if(this.moving&&this.grounded)
this.bob+=dt*(this.sprinting?12:8.5);
}
this.findInteraction(game);
if(pressed.has('KeyE'))this.interact(game);
}
findInteraction(game) {
if(this.vehicle) {
this.target={
type:'exit',
label:Math.abs(this.vehicle.speed)>5?'Slow down to exit':'Exit vehicle'
};
return;
}
const candidates=[
...this.world.interactions.filter(i=>!i.used),
...game.actors.pedestrians.filter(p=>p.group.visible),
...game.actors.vehicles.filter(v=>Math.abs(v.speed)<1.5).map(v=>({
type:'vehicle',x:v.x,z:v.z,vehicle:v,
label:`Enter ${v===game.actors.delivery?'delivery ':''}${v.type}`
}))
];
let best=null,score=Infinity;
for(const object of candidates) {
const d=distance(this,object);
const range=object.type==='vehicle'?4.2:
object.type==='ped'?2.5:3;
if(d>range)continue;
if(object.y!==undefined&&Math.abs(this.y-object.y)>1.5)continue;
const facing=d<.5?1:
((object.x-this.x)*Math.sin(this.viewYaw)+
(object.z-this.z)*Math.cos(this.viewYaw))/d;
if(facing<.35)continue;
if(!['vehicle','door'].includes(object.type)&&
!this.world.clearLine(this,object,this.y+.95))continue;
const value=d-facing;
if(value<score){best=object;score=value;}
}
this.target=best;
}
enter(vehicle,game) {
if(vehicle.health<=0) {
game.ui.toast('Disabled vehicle. Bring it near Tidal service or use another car.');
return;
}
vehicle.ai=false;vehicle.speed=0;vehicle.doorTimer=.7;
this.vehicle=vehicle;
this.x=vehicle.x;this.z=vehicle.z;this.y=0;
this.yaw=vehicle.yaw;this.viewYaw=vehicle.yaw;
this.headYaw=0;this.pitch=0;this.phone=false;
if(vehicle.type==='police')game.actors.crime(.9,game);
game.sound.tone(110,.1,.07,'triangle');
}
exit(game) {
const v=this.vehicle;
if(Math.abs(v.speed)>5) {
game.ui.toast('Slow below 18 km/h to exit safely.');
return;
}
const options=[
{x:v.x+Math.cos(v.yaw)*2.8,z:v.z-Math.sin(v.yaw)*2.8},
{x:v.x-Math.cos(v.yaw)*2.8,z:v.z+Math.sin(v.yaw)*2.8},
{x:v.x-Math.sin(v.yaw)*3.2,z:v.z-Math.cos(v.yaw)*3.2}
];
const spot=options.find(q=>
!this.world.blocked(q.x,q.z,.35,0,1.7)&&
!game.actors.vehicles.some(o=>o!==v&&distance(o,q)<o.radius+.4)
);
if(!spot) {
game.ui.toast('Exit blocked. Move the vehicle.');
return;
}
v.speed=0;v.doorTimer=.7;
this.vehicle=null;
this.x=spot.x;this.z=spot.z;
this.y=this.world.floor(this.x,this.z);
this.yaw=v.yaw+this.headYaw;this.viewYaw=this.yaw;
this.pitch=0;this.vy=0;this.eye=1.66;this.grounded=true;
}
interact(game) {
if(this.phone) {
if(!game.missions.active&&!game.missions.finished)
game.missions.accept(game);
else game.ui.toast(game.missions.objective(game),7);
this.phone=false;
return;
}
const object=this.target;
if(!object)return;
if(game.missions.interact(object,game))return;
switch(object.type) {
case 'vehicle':
this.enter(object.vehicle,game);
break;
case 'exit':
this.exit(game);
break;
case 'door':
if(object.open&&distance(this,object)<1) {
game.ui.toast('Step clear of the doorway first.');
break;
}
object.open=!object.open;
game.sound.hit(.035);
break;
case 'phone':
if(!game.missions.active&&!game.missions.finished)
game.missions.accept(game);
else this.phone=true;
break;
case 'switch':
this.world.interiorLight.intensity=
this.world.interiorLight.intensity>10?5:75;
game.sound.tone(210,.06,.03);
game.ui.toast('Depot power switched');
break;
case 'pickup':
object.used=true;object.mesh.visible=false;
this.health=100;
game.ui.toast('First aid collected · Health restored');
break;
case 'shop':
if(this.cash<25)game.ui.toast('You need $25.');
else {
this.cash-=25;
this.health=Math.min(100,this.health+40);
this.stamina=100;
game.ui.toast('Cold drink, warm welcome. Health +40');
}
break;
case 'repair': {
const nearest=game.actors.vehicles
.filter(v=>distance(v,object)<13)
.sort((a,b)=>distance(a,object)-distance(b,object))[0];
if(!nearest)game.ui.toast('Park a vehicle beside the repair sign.');
else if(this.cash<100)game.ui.toast('Repair service costs $100.');
else {
this.cash-=100;nearest.health=100;
game.ui.toast(`${nearest.type.toUpperCase()} repaired`);
game.sound.tone(440,.15,.05);
}
break;
}
case 'sign':
game.ui.toast(object.text,9);
break;
case 'ped': {
object.pause=4;
const lines=game.missions.support>=3?[
'“Marlin’s lights stayed on. People noticed.”',
'“The relay is working. We can warn each other now.”'
]:[
'“Sol Terrace has the best view. Stairs around the east side.”',
'“They sell paradise. Nobody mentions the flood line.”',
'“Marlin stays open when the rest of the city locks its doors.”',
'“Sometimes 87.6 broadcasts tomorrow’s weather.”'
];
game.ui.toast(lines[Math.floor(Math.random()*lines.length)],7);
game.sound.tone(190,.12,.025,'triangle');
break;
}
case 'case':
game.ui.toast('A sealed tide recorder. Dispatch will tell you when to collect it.');
break;
case 'terminal':
game.ui.toast(object.id==='transmitter'?
'Static. Then a voice: “Tomorrow’s weather has been cancelled.”':
'Community relay standing by.',7);
break;
}
}
render(dt,game) {
const v=this.vehicle;
const offset=v?new THREE.Vector3(
v.eyeSide,v.eyeHeight,v.eyeForward
).applyAxisAngle(new THREE.Vector3(0,1,0),v.yaw):
new THREE.Vector3(0,this.eye,0);
const bob=!game.settings.reducedMotion&&!v&&this.moving&&this.grounded?
Math.sin(this.bob)*.017:0;
const target=new THREE.Vector3(
this.x+offset.x,this.y+offset.y+bob,this.z+offset.z
);
this.camera.position.lerp(target,1-Math.exp(-dt*(v?14:22)));
this.camera.rotation.set(
this.pitch,this.viewYaw+Math.PI,
game.settings.reducedMotion?0:
Math.sin(game.time.elapsed*35)*this.shake*.009
);
this.phoneGroup.position.y=THREE.MathUtils.damp(
this.phoneGroup.position.y,this.phone?-.22:-.9,10,dt
);
this.phoneGroup.visible=this.phoneGroup.position.y>-.86;
this.phoneTick-=dt;
if(this.phone&&this.phoneTick<=0) {
this.phoneTick=.15;
game.ui.drawPhone(this.phoneCanvas.getContext('2d'),game);
this.phoneTexture.needsUpdate=true;
}
}
snapshot() {
return {
x:this.x,y:this.y,z:this.z,yaw:this.yaw,pitch:this.pitch,
health:this.health,stamina:this.stamina,cash:this.cash,
vehicle:this.vehicle?.id??null
};
}
restore(s,game) {
this.reset();
this.x=s.x;this.y=s.y;this.z=s.z;this.yaw=s.yaw;
this.pitch=s.pitch||0;
this.health=clamp(s.health,1,100);
this.stamina=clamp(s.stamina,0,100);
this.cash=Math.max(0,s.cash);
this.vehicle=s.vehicle===null?null:game.actors.vehicles[s.vehicle]||null;
if(this.vehicle) {
this.vehicle.ai=false;
this.x=this.vehicle.x;this.z=this.vehicle.z;
this.y=0;this.yaw=this.vehicle.yaw;
} else if(this.world.blocked(this.x,this.z,.32,this.y,1.6)) {
this.x=10;this.z=30;this.y=0;
}
this.viewYaw=this.yaw;
this.camera.position.set(this.x,this.y+1.66,this.z);
}
}
