import * as THREE from 'three';
import { clamp,distance } from './world.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
export class Input {
constructor(canvas) {
this.keys=new Set();
this.pressed=new Set();
window.addEventListener('keydown',e=>{
if(['Space','Tab'].includes(e.code))e.preventDefault();
this.keys.add(e.code);
if(!e.repeat)this.pressed.add(e.code);
});
window.addEventListener('keyup',e=>this.keys.delete(e.code));
window.addEventListener('blur',()=>this.clear());
this.canvas=canvas;
}
take() {
const result=new Set(this.pressed);
this.pressed.clear();
return result;
}
clear() {
this.keys.clear();
this.pressed.clear();
}
}
export class TimeSystem {
constructor(scene,renderer,world) {
this.scene=scene;this.renderer=renderer;
this.hours=17.4;this.elapsed=0;this.night=0;
this.lightTick=0;
this.sun=new THREE.DirectionalLight(0xffdfb7,2.6);
this.sun.castShadow=true;
this.sun.shadow.mapSize.set(2048,2048);
Object.assign(this.sun.shadow.camera,{
left:-100,right:100,top:100,bottom:-100,near:1,far:430
});
this.sun.shadow.normalBias=.45;
this.sun.shadow.bias=-.00025;
scene.add(this.sun,this.sun.target);
this.ambient=new THREE.HemisphereLight(0xb4d0de,0x65505c,1);
scene.add(this.ambient);
scene.fog=new THREE.FogExp2(0x829aab,.0032);
this.lights=Array.from({length:4},()=>{
const light=new THREE.PointLight(0xffcc98,0,23,2);
scene.add(light);
return light;
});
this.skyMaterial=new THREE.ShaderMaterial({
side:THREE.BackSide,depthWrite:false,
uniforms:{
day:{value:1},cloud:{value:0},time:{value:0},
sun:{value:new THREE.Vector3(1,.2,0)}
},
vertexShader:`
varying vec3 direction;
void main(){
direction=position;
gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
`,
fragmentShader:`
varying vec3 direction;
uniform float day;
uniform float cloud;
uniform float time;
uniform vec3 sun;
float hash(vec2 p){
return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}
float noise(vec2 p){
vec2 i=floor(p),f=fract(p);
f=f*f*(3.-2.*f);
return mix(
mix(hash(i),hash(i+vec2(1,0)),f.x),
mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y
);
}
float fbm(vec2 p){
float v=0.,a=.5;
for(int i=0;i<4;i++){
v+=noise(p)*a;
p=p*2.03+vec2(7.1,4.2);
a*=.5;
}
return v;
}
void main(){
vec3 d=normalize(direction);
float h=max(d.y,0.);
float horizon=pow(1.-h,3.);
vec3 top=mix(vec3(.009,.018,.041),vec3(.16,.31,.41),day);
vec3 edge=mix(vec3(.055,.072,.11),vec3(.68,.58,.48),day);
vec3 color=mix(top,edge,horizon);
float glow=pow(max(dot(d,normalize(sun)),0.),22.);
color+=vec3(.55,.24,.12)*glow*day;
vec2 uv=d.xz/max(.15,d.y+.23)*1.7;
uv+=vec2(time*.002,time*.0008);
float clouds=smoothstep(.5-cloud*.18,.75-cloud*.1,fbm(uv));
clouds*=smoothstep(0.,.2,d.y)*(.18+cloud*.7);
color=mix(color,mix(vec3(.09,.10,.14),vec3(.61,.63,.62),day),clouds);
float star=step(.999,hash(floor(d.xz/max(.15,d.y)*400.)));
color+=star*(1.-day)*(1.-cloud)*smoothstep(.2,.6,d.y)*.23;
gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`
});
this.sky=new THREE.Mesh(
new THREE.SphereGeometry(650,32,20),this.skyMaterial
);
this.sky.frustumCulled=false;
this.sky.renderOrder=-10;
scene.add(this.sky);
}
green(axis) {
return Math.floor(this.elapsed/10)%2===axis;
}
update(dt,weather,player,world) {
this.elapsed+=dt;
this.hours=(this.hours+dt/100)%24;
const altitude=Math.sin((this.hours-6)/24*Math.PI*2);
this.night=1-clamp((altitude+.1)*3.6,0,1);
const daylight=1-this.night;
const sunset=clamp(1-Math.abs(altitude)/.35,0,1)*daylight;
const skyColor=new THREE.Color(0x101e36)
.lerp(new THREE.Color(0x92b3bd),daylight)
.lerp(new THREE.Color(0xc58e91),sunset*.4)
.lerp(new THREE.Color(0x607481),weather.cloud*.4);
this.scene.fog.color.copy(skyColor);
this.scene.fog.density=.0028+weather.cloud*.002;
const orbit=this.hours/24*Math.PI*2;
this.sun.position.set(
player.x+Math.cos(orbit)*130,
45+Math.abs(altitude)*140,
player.z+Math.sin(orbit)*110
);
this.sun.target.position.set(player.x,0,player.z);
this.sun.color.setHex(0xffe3bd)
.lerp(new THREE.Color(0xffba91),sunset*.65)
.lerp(new THREE.Color(0x93ade0),this.night);
this.sun.intensity=(.16+daylight*2.8)*(1-weather.cloud*.55);
this.ambient.intensity=.38+daylight*.95-weather.cloud*.12;
this.renderer.toneMappingExposure=.95;
this.scene.environmentIntensity=.13+daylight*.55;
this.sky.position.copy(player.camera.position);
this.skyMaterial.uniforms.day.value=daylight;
this.skyMaterial.uniforms.cloud.value=weather.cloud;
this.skyMaterial.uniforms.time.value=this.elapsed;
this.skyMaterial.uniforms.sun.value.copy(this.sun.position)
.sub(this.sun.target.position).normalize();
this.lightTick-=dt;
if(this.lightTick<=0) {
this.lightTick=.4;
const lamps=[...world.lamps].sort((a,b)=>
distance(a,player)-distance(b,player)
);
this.lights.forEach((l,i)=>l.position.copy(lamps[i]));
}
this.lights.forEach(l=>l.intensity=this.night*55);
}
}
export class Weather {
constructor(scene) {
this.kind=0;this.rain=0;this.cloud=0;this.wet=0;this.timer=100;
this.names=['CLEAR','OVERCAST','RAIN'];
const count=550;
this.drops=Array.from({length:count},()=>({
x:Math.random()*64-32,z:Math.random()*64-32,y:Math.random()*28
}));
this.positions=new Float32Array(count*6);
const geometry=new THREE.BufferGeometry();
geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));
this.mesh=new THREE.LineSegments(
geometry,new THREE.LineBasicMaterial({
color:0xb8d6e2,transparent:true,opacity:0,depthWrite:false
})
);
this.mesh.frustumCulled=false;
scene.add(this.mesh);
this.puddleMaterial=new THREE.MeshStandardMaterial({
color:0x60767c,roughness:.13,metalness:.48,
transparent:true,opacity:0,depthWrite:false,
polygonOffset:true,polygonOffsetFactor:-1
});
for(let i=0;i<28;i++) {
const puddle=new THREE.Mesh(
new THREE.CircleGeometry(1,12),this.puddleMaterial
);
puddle.rotation.x=-Math.PI/2;
puddle.rotation.z=i;
puddle.scale.set(.65+(i%3)*.25,1.2+(i%4)*.4,1);
puddle.position.set(
[-120,-60,0,60,120][i%5]+5.7,
.078,-132+(i*31)%260
);
scene.add(puddle);
}
}
cycle() {
this.kind=(this.kind+1)%3;
this.timer=80+Math.random()*70;
}
update(dt,p) {
this.timer-=dt;
if(this.timer<=0)this.cycle();
this.cloud=THREE.MathUtils.damp(
this.cloud,this.kind===0?0:this.kind===1?.55:1,.22,dt
);
this.rain=THREE.MathUtils.damp(
this.rain,this.kind===2?1:0,.6,dt
);
this.wet=THREE.MathUtils.damp(
this.wet,this.kind===2?1:0,.04,dt
);
this.mesh.visible=this.rain>.02;
this.mesh.material.opacity=this.rain*.32;
this.puddleMaterial.opacity=this.wet*.42;
for(let i=0;i<this.drops.length;i++) {
const d=this.drops[i];
d.y-=dt*23;
if(d.y<0) {
d.y+=28;d.x=Math.random()*64-32;d.z=Math.random()*64-32;
}
const j=i*6;
this.positions[j]=p.x+d.x;
this.positions[j+1]=p.y+d.y;
this.positions[j+2]=p.z+d.z;
this.positions[j+3]=p.x+d.x-.2;
this.positions[j+4]=p.y+d.y+1.1;
this.positions[j+5]=p.z+d.z;
}
this.mesh.geometry.attributes.position.needsUpdate=true;
}
}
export class Sound {
constructor() {
this.ctx=null;
this.volume=.45;
this.radio=true;
this.stepTimer=0;
this.musicStep=0;
this.nextNote=0;
}
start() {
if(this.ctx){this.ctx.resume();return;}
const AudioContext=window.AudioContext||window.webkitAudioContext;
if(!AudioContext)return;
const ctx=this.ctx=new AudioContext();
this.master=ctx.createGain();
this.master.gain.value=this.volume;
this.master.connect(ctx.destination);
this.noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
const data=this.noise.getChannelData(0);
for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
const loopNoise=(frequency)=>{
const source=ctx.createBufferSource();
source.buffer=this.noise;source.loop=true;
const filter=ctx.createBiquadFilter();
filter.type='lowpass';filter.frequency.value=frequency;
const gain=ctx.createGain();gain.gain.value=0;
source.connect(filter);filter.connect(gain);gain.connect(this.master);
source.start();
return gain;
};
this.rainGain=loopNoise(2100);
this.oceanGain=loopNoise(420);
this.windGain=loopNoise(180);
const voice=(type,spatial=false)=>{
const oscillator=ctx.createOscillator();
const filter=ctx.createBiquadFilter();
const gain=ctx.createGain();
oscillator.type=type;
filter.type='lowpass';filter.frequency.value=type==='sine'?2000:300;
gain.gain.value=0;
oscillator.connect(filter);filter.connect(gain);
let panner=null;
if(spatial) {
panner=ctx.createPanner();
panner.panningModel='HRTF';
panner.distanceModel='inverse';
panner.refDistance=4;
panner.rolloffFactor=1.4;
gain.connect(panner);panner.connect(this.master);
} else gain.connect(this.master);
oscillator.start();
return {oscillator,gain,panner};
};
this.engine=voice('sawtooth');
this.siren=voice('sine',true);
this.traffic=Array.from({length:4},()=>voice('sawtooth',true));
this.musicGain=ctx.createGain();
this.musicGain.gain.value=0;
this.musicGain.connect(this.master);
this.nextNote=ctx.currentTime+.1;
}
pause() {
if(this.ctx?.state==='running')this.ctx.suspend();
}
tone(frequency=440,duration=.12,volume=.06,type='sine',at=null,bus=null) {
if(!this.ctx)return;
const ctx=this.ctx,start=at??ctx.currentTime;
const oscillator=ctx.createOscillator(),gain=ctx.createGain();
oscillator.type=type;oscillator.frequency.value=frequency;
gain.gain.setValueAtTime(.0001,start);
gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume),start+.01);
gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
oscillator.connect(gain);gain.connect(bus||this.master);
oscillator.start(start);oscillator.stop(start+duration+.02);
}
hit(volume=.1,duration=.12,frequency=600) {
if(!this.ctx)return;
const ctx=this.ctx,source=ctx.createBufferSource();
const gain=ctx.createGain(),filter=ctx.createBiquadFilter();
source.buffer=this.noise;
filter.type='lowpass';filter.frequency.value=frequency;
gain.gain.setValueAtTime(volume,ctx.currentTime);
gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
source.connect(filter);filter.connect(gain);gain.connect(this.master);
source.start();source.stop(ctx.currentTime+duration);
}
update(dt,game) {
if(!this.ctx)return;
const ctx=this.ctx,now=ctx.currentTime;
const p=game.player,v=p.vehicle;
this.master.gain.setTargetAtTime(this.volume,now,.2);
const listener=ctx.listener;
if(listener.positionX) {
listener.positionX.value=p.x;
listener.positionY.value=p.y+1.6;
listener.positionZ.value=p.z;
listener.forwardX.value=Math.sin(p.viewYaw);
listener.forwardY.value=0;
listener.forwardZ.value=Math.cos(p.viewYaw);
listener.upX.value=0;listener.upY.value=1;listener.upZ.value=0;
}
this.rainGain.gain.setTargetAtTime(game.weather.rain*.09,now,.4);
this.windGain.gain.setTargetAtTime(.014+game.weather.cloud*.02,now,.4);
this.oceanGain.gain.setTargetAtTime(
clamp((p.x-90)/85,0,1)*(.04+.015*Math.sin(game.time.elapsed*.6)),
now,.4
);
this.engine.oscillator.frequency.setTargetAtTime(
35+Math.abs(v?.speed||0)*3,now,.08
);
this.engine.gain.gain.setTargetAtTime(v?.055:0,now,.1);
const nearest=game.actors.vehicles.filter(a=>a.ai&&a!==v)
.sort((a,b)=>distance(a,p)-distance(b,p));
this.traffic.forEach((voice,i)=>{
const a=nearest[i];
voice.gain.gain.setTargetAtTime(a?.045:0,now,.15);
if(a) {
voice.oscillator.frequency.setTargetAtTime(35+Math.abs(a.speed)*2,now,.1);
voice.panner.positionX.value=a.x;
voice.panner.positionY.value=1;
voice.panner.positionZ.value=a.z;
}
});
const police=nearest.find(a=>a.type==='police');
this.siren.gain.gain.setTargetAtTime(
police&&game.actors.heat>.01?.12:0,now,.2
);
this.siren.oscillator.frequency.setTargetAtTime(
710+Math.sin(game.time.elapsed*5)*230,now,.025
);
if(police) {
this.siren.panner.positionX.value=police.x;
this.siren.panner.positionY.value=1.5;
this.siren.panner.positionZ.value=police.z;
}
if(!v&&p.moving&&p.grounded) {
this.stepTimer-=dt;
if(this.stepTimer<=0) {
this.hit(p.sprinting?.045:.025,.065,game.weather.wet>.5?1200:420);
this.stepTimer=p.sprinting?.3:.46;
}
} else this.stepTimer=0;
const musicOn=this.radio&&!!v;
this.musicGain.gain.setTargetAtTime(
musicOn?.22*(1-game.actors.heat*.12):0,now,.4
);
if(!musicOn) {
this.nextNote=now+.05;
return;
}
if(this.nextNote<now)this.nextNote=now+.02;
const midi=n=>440*Math.pow(2,(n-69)/12);
while(this.nextNote<now+.1) {
const roots=[45,41,48,43];
const root=roots[Math.floor(this.musicStep/16)%4];
const beat=this.musicStep%16;
const at=this.nextNote;
if([0,3,6,8,11,14].includes(beat))
this.tone(midi(root-12),.22,.15,'triangle',at,this.musicGain);
if(beat===0)for(const note of [0,3,7,10])
this.tone(midi(root+12+note),1.5,.025,'triangle',at,this.musicGain);
if(beat%2) {
const melody=[12,19,15,22,19,24,15,17];
this.tone(midi(root+melody[Math.floor(beat/2)]),
.3,.045,'sine',at,this.musicGain);
}
this.musicStep++;
this.nextNote+=60/104/4;
}
}
}
export function cinematicPass() {
return new ShaderPass({
uniforms:{
tDiffuse:{value:null},time:{value:0},grain:{value:.003}
},
vertexShader:`
varying vec2 vUv;
void main(){
vUv=uv;
gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
`,
fragmentShader:`
uniform sampler2D tDiffuse;
uniform float time;
uniform float grain;
varying vec2 vUv;
void main(){
vec3 c=texture2D(tDiffuse,vUv).rgb;
float l=dot(c,vec3(.2126,.7152,.0722));
c=mix(vec3(l),c,.94);
vec2 q=vUv*2.-1.;
c*=1.-smoothstep(.3,1.45,length(q))*.16;
float n=fract(sin(dot(gl_FragCoord.xy+floor(time*24.),
vec2(12.9898,78.233)))*43758.5453);
c+=(n-.5)*grain;
gl_FragColor=vec4(max(c,vec3(0)),1.);
}
`
});
}
export class SaveSystem {
constructor() {
this.key='neon-coast-complete-v2';
}
valid(s) {
if(!s||s.version!==2||!s.player||!s.actors||!s.missions)return false;
const p=s.player;
if(![p.x,p.y,p.z,p.yaw,p.health,p.stamina,p.cash,s.hours]
.every(Number.isFinite))return false;
if(Math.abs(p.x)>180||Math.abs(p.z)>160||p.y<0||p.y>100)return false;
if(!Array.isArray(s.actors.vehicles)||s.actors.vehicles.length!==25)return false;
if(s.actors.vehicles.some(v=>
![v.id,v.x,v.z,v.yaw,v.health,v.from,v.to].every(Number.isFinite)||
v.from<0||v.from>24||v.to<0||v.to>24
))return false;
if(!Number.isInteger(s.missions.chapter)||
s.missions.chapter<0||s.missions.chapter>4)return false;
return true;
}
read() {
try {
const s=JSON.parse(localStorage.getItem(this.key));
return this.valid(s)?s:null;
} catch{return null;}
}
write(state) {
try {
localStorage.setItem(this.key,JSON.stringify(state));
return true;
} catch{return false;}
}
}
