const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const WORLD = {w:6000,h:4400};
const MAX_PLAYERS = 16;
const SAFE_ZONE = {x:3000,y:2200,r:300};
const SERVER_VERSION = "20261001-42";
const AMMO_PACK_SIZE=50,AMMO_PACK_COST=50,MAX_AMMO=120;
const SHOP_NPC={x:3000,y:2380,r:95};
const WEAPONS={blaster:{name:"BLASTER",cost:0,damage:25,fireRate:350},pulse:{name:"PULSE",cost:150,damage:18,fireRate:170},cannon:{name:"CANNON",cost:300,damage:65,fireRate:700}};
const HP_REGEN_PER_SEC=3;
const SERVER_STARTED_AT = Date.now();
function inSafeZone(x,y,pad=0){return Math.hypot(x-SAFE_ZONE.x,y-SAFE_ZONE.y)<=SAFE_ZONE.r+pad;}
const clients = new Map();
const savedPlayers = new Map();
const rooms = new Map();
const roomEnemies = new Map();
rooms.set("OPEN",new Set());
roomEnemies.set("OPEN",[]);
const PUBLIC_ROOMS=["12345","67890"];
for(const code of PUBLIC_ROOMS){rooms.set(code,new Set());roomEnemies.set(code,[]);}
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(){
  let code="";
  do{
    code="";
    for(let i=0;i<4;i++) code += CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)];
  }while(rooms.has(code));
  return code;
}
function send(ws,msg){
  if(ws.readyState===1) ws.send(JSON.stringify(msg));
}
function roomPlayers(room){
  return [...room].map(ws=>clients.get(ws)).filter(Boolean);
}
function publicPlayers(room){
  return roomPlayers(room).map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,angle:p.angle,hp:p.hp,alive:p.alive,level:p.level,score:p.score,kills:p.kills,xp:p.xp,damage:p.damage,defense:p.defense,fireRate:p.fireRate,color:p.color}));
}
function sendPlayerList(code){
  broadcastRoom(code,{type:"player_list",players:publicPlayers(rooms.get(code)||new Set())});
}
function sendStats(p){
  if(!p || !p.ws)return;
  send(p.ws,{type:"server_stats",kills:p.kills,pvpKills:p.pvpKills,score:p.score,xp:p.xp,level:p.level,damage:p.damage,defense:p.defense,fireRate:p.fireRate,maxHp:100+(p.level-1)*15,xpNeed:100,killsToLevel:5-(p.kills%5||5),gold:p.gold||0,ammo:p.ammo??0,maxAmmo:MAX_AMMO,shopNpc:SHOP_NPC});
}
function makeEnemy(){
  const elite=Math.random()<.2;
  const r=elite?27:21;
  const shapes=["square","triangle","hex"];
  let x=0,y=0;
  do{x=Math.random()*(WORLD.w-200)+100;y=Math.random()*(WORLD.h-200)+100;}while(inSafeZone(x,y,60));
  return {id:Math.random().toString(36).slice(2,10),x,y,r,hp:elite?85:50,maxHp:elite?85:50,speed:elite?55:75,damage:elite?14:9,kind:elite?"elite":"drone",shape:shapes[Math.floor(Math.random()*shapes.length)]};
}
function ensureRoomEnemies(code){
  if(!roomEnemies.has(code)){
    const list=[];
    for(let i=0;i<18;i++)list.push(makeEnemy());
    roomEnemies.set(code,list);
  }
  return roomEnemies.get(code);
}
function sendEnemyState(code){
  const room=rooms.get(code);
  if(!room || !room.size)return;
  broadcastRoom(code,{type:"enemy_state",enemies:ensureRoomEnemies(code)});
}
function broadcastRoom(code,msg,except=null){
  const room=rooms.get(code);
  if(!room)return;
  const data=JSON.stringify(msg);
  for(const ws of room){
    if(ws!==except && ws.readyState===1) ws.send(data);
  }
}
function leaveRoom(ws){
  const p=clients.get(ws);
  if(!p || !p.room)return;
  const code=p.room;
  const room=rooms.get(code);
  if(room){
    room.delete(ws);
    if(room.size===0 && code!=="OPEN" && !PUBLIC_ROOMS.includes(code)){ rooms.delete(code); roomEnemies.delete(code); }
    else { broadcastRoom(code,{type:"player_leave",id:p.id}); sendPlayerList(code); }
  }
  p.room="";
}
function joinRoom(ws,requestedCode,create=false){
  const p=clients.get(ws);
  if(!p)return;
  let code=String(requestedCode||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5);
  if(create || !code){
    code=makeCode();
    rooms.set(code,new Set());
  }
  const room=rooms.get(code);
  if(!room){
    send(ws,{type:"room_error",message:"Sala no encontrada"});
    return;
  }
  if(room.size>=MAX_PLAYERS){
    send(ws,{type:"room_error",message:"Sala llena"});
    return;
  }
  leaveRoom(ws);
  room.add(ws);
  ensureRoomEnemies(code);
  p.room=code;
  p.ws=ws;
  const spawn=spawnPosition(code);
  if(!p.hasSaved){p.x=spawn.x;p.y=spawn.y;p.hp=100;}
  p.angle=0;
  p.alive=true;
  p.hasSaved=false;
  send(ws,{type:"room_joined",code,players:publicPlayers(room),enemies:ensureRoomEnemies(code),safeZone:SAFE_ZONE,spawnProtectionMs:5000});
  sendStats(p);
  broadcastRoom(code,{type:"player_join",player:p},ws);
  sendPlayerList(code);
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function spawnPosition(code){
  const room=rooms.get(code)||new Set();
  const index=room.size;
  const spots=[
    [3000,2200],[2900,2200],[3100,2200],[3000,2100],
    [2750,2200],[3250,2200],[3000,1900],[3000,2500],
    [2700,1900],[3300,1900],[2700,2500],[3300,2500],
    [2850,1850],[3150,1850],[2850,2550],[3150,2550]
  ];
  const s=spots[index%spots.length];
  return {x:s[0],y:s[1]};
}
function buyAmmo(ws){const p=clients.get(ws);if(!p||!p.room||!p.alive)return;if(Math.hypot(p.x-SHOP_NPC.x,p.y-SHOP_NPC.y)>SHOP_NPC.r){send(ws,{type:"shop_result",ok:false,message:"Acércate al vendedor de munición."});return;}const ammo=Number(p.ammo)||0,gold=Number(p.gold)||0;if(ammo>=MAX_AMMO){send(ws,{type:"shop_result",ok:false,message:"Munición al máximo."});return;}if(gold<AMMO_PACK_COST){send(ws,{type:"shop_result",ok:false,message:"Necesitas 50 de oro."});return;}p.gold=gold-AMMO_PACK_COST;p.ammo=Math.min(MAX_AMMO,ammo+AMMO_PACK_SIZE);send(ws,{type:"shop_result",ok:true,message:"Compraste "+(p.ammo-ammo)+" balas.",gold:p.gold,ammo:p.ammo,maxAmmo:MAX_AMMO});sendStats(p);}
function findPlayer(id,room){
  for(const ws of room||[]) {
    const p=clients.get(ws);
    if(p && p.id===id)return {ws,p};
  }
  return null;
}
function handleShot(ws){
  const shooter=clients.get(ws);
  if(!shooter || !shooter.room || !shooter.alive)return;
  if(inSafeZone(shooter.x,shooter.y,24))return;
  if((shooter.ammo||0)<=0){send(ws,{type:"ammo_empty"});return;}
  const now=Date.now();
  const cooldown=Math.max(100,Math.min(500,Number(shooter.fireRate)||280));
  if(now-shooter.lastShot<cooldown)return;
  shooter.lastShot=now;

  const room=rooms.get(shooter.room);
  if(!room)return;
  const damage=clamp(Number(shooter.damage)||25,10,150);
  const maxRange=1000;
  let targetPlayer=null,targetEnemy=null,best=Infinity;

  for(const otherWs of room){
    const targetPlayerData=clients.get(otherWs);
    if(!targetPlayerData || targetPlayerData===shooter || !targetPlayerData.alive || inSafeZone(targetPlayerData.x,targetPlayerData.y,24))continue;
    const dx=targetPlayerData.x-shooter.x,dy=targetPlayerData.y-shooter.y;
    const d=Math.hypot(dx,dy);
    if(d>maxRange)continue;
    let diff=Math.atan2(dy,dx)-shooter.angle;
    diff=Math.atan2(Math.sin(diff),Math.cos(diff));
    const hitWidth=.16 + 24/Math.max(d,60);
    if(Math.abs(diff)<=hitWidth && d<best){best=d;targetPlayer={ws:otherWs,p:targetPlayerData};}
  }

  const enemies=ensureRoomEnemies(shooter.room);
  for(const pl of players){
      const maxHp=100+(pl.level-1)*15;
      if(pl.hp>0 && pl.hp<maxHp){
        const before=pl.hp;
        pl.hp=clamp(pl.hp+HP_REGEN_PER_SEC*dt,0,maxHp);
        if(pl.hp>before) send(pl.ws,{type:"hp_regen",hp:pl.hp,maxHp});
      }
    }
    for(const enemy of enemies){
    const dx=enemy.x-shooter.x,dy=enemy.y-shooter.y;
    const d=Math.hypot(dx,dy);
    if(d>maxRange)continue;
    let diff=Math.atan2(dy,dx)-shooter.angle;
    diff=Math.atan2(Math.sin(diff),Math.cos(diff));
    const hitWidth=.16 + enemy.r/Math.max(d,60);
    if(Math.abs(diff)<=hitWidth && d<best){best=d;targetEnemy=enemy;targetPlayer=null;}
  }

  shooter.ammo=Math.max(0,(shooter.ammo||0)-1);sendStats(shooter);
  broadcastRoom(shooter.room,{type:"player_shot",id:shooter.id,x:shooter.x,y:shooter.y,angle:shooter.angle});

  if(targetPlayer){
    targetPlayer.p.hp=clamp(targetPlayer.p.hp-Math.max(1,damage-(targetPlayer.p.defense||0)),0,100);
    send(targetPlayer.ws,{type:"pvp_damage",from:shooter.id,amount:damage,hp:targetPlayer.p.hp});
    broadcastRoom(shooter.room,{type:"pvp_hit",shooter:shooter.id,target:targetPlayer.p.id,amount:damage,hp:targetPlayer.p.hp});
    if(targetPlayer.p.hp<=0){
      targetPlayer.p.alive=false;
      const lostScore=targetPlayer.p.score||0;
      targetPlayer.p.level=1;targetPlayer.p.hp=0;targetPlayer.p.damage=25;targetPlayer.p.defense=0;targetPlayer.p.fireRate=280;
      targetPlayer.p.xp=0;targetPlayer.p.score=0;targetPlayer.p.kills=0;targetPlayer.p.pvpKills=0;
      shooter.kills=(shooter.kills||0)+1;shooter.pvpKills=(shooter.pvpKills||0)+1;shooter.score=(shooter.score||0)+25;shooter.xp=(shooter.xp||0)+40;
      if(shooter.kills%5===0){shooter.level++;shooter.xp=0;shooter.damage+=5;shooter.defense+=2;shooter.fireRate=Math.max(140,shooter.fireRate-8);}
      send(targetPlayer.ws,{type:"pvp_dead",killer:shooter.name,lostScore});
      broadcastRoom(shooter.room,{type:"pvp_kill",killer:shooter.id,target:targetPlayer.p.id});
      sendStats(shooter);
    }
    return;
  }

  if(targetEnemy){
    targetEnemy.hp=clamp(targetEnemy.hp-damage,0,targetEnemy.maxHp);
    broadcastRoom(shooter.room,{type:"enemy_hit",id:targetEnemy.id,hp:targetEnemy.hp});
    if(targetEnemy.hp<=0){
      const reward=targetEnemy.kind==="elite"?30:12;
      const xp=targetEnemy.kind==="elite"?35:20;
      shooter.gold=(shooter.gold||0)+reward;
      const index=enemies.findIndex(e=>e.id===targetEnemy.id);
      if(index>=0)enemies.splice(index,1);
      shooter.kills=(shooter.kills||0)+1;shooter.score=(shooter.score||0)+reward;shooter.xp=(shooter.xp||0)+xp;
      if(shooter.kills%5===0){shooter.level++;shooter.xp=0;shooter.damage+=5;shooter.defense+=2;shooter.fireRate=Math.max(140,shooter.fireRate-8);}
      sendStats(shooter);
      broadcastRoom(shooter.room,{type:"enemy_dead",id:targetEnemy.id,killer:shooter.id});
    }
  }
}

const httpServer=http.createServer((req,res)=>{
  if(req.url==="/health" || req.url==="/"){
    res.writeHead(200,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Cache-Control":"no-store"});
    return res.end(JSON.stringify({
      ok:true,
      game:"Neon Core",
      players:clients.size,
      rooms:rooms.size,
      pvp:true,
      version:SERVER_VERSION,
      startedAt:SERVER_STARTED_AT,
      status:"online"
    }));
  }
  res.writeHead(404);res.end();
});

const wss=new WebSocketServer({server:httpServer,path:"/ws"});

wss.on("connection",(ws)=>{
  const id=Math.random().toString(36).slice(2,10);
  const player={
    id,name:"Jugador",saveKey:"",x:3000,y:2200,angle:0,hp:100,level:1,
    damage:25,defense:0,fireRate:280,score:0,kills:0,xp:0,pvpKills:0,gold:0,ammo:60,bankedGold:0,weapon:"blaster",
    color:"#39e7ff",room:"",alive:true,frozen:false,lastShot:0
  };
  player.ws=ws;
  clients.set(ws,player);
  send(ws,{type:"connected",id});

  ws.on("message",(raw)=>{
    try{
      const msg=JSON.parse(raw.toString());
      const p=clients.get(ws);
      if(!p)return;

      if(msg.type==="join"){
        p.name=String(msg.name||"Jugador").slice(0,20);
        p.saveKey=String(msg.saveKey||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
        const saved=p.saveKey?savedPlayers.get(p.saveKey):null;
        p.hasSaved=!!saved;
        if(saved){
          p.x=Number.isFinite(saved.x)?saved.x:p.x;
          p.y=Number.isFinite(saved.y)?saved.y:p.y;
          p.level=Number(saved.level)||1;p.hp=Number(saved.hp)||100;p.damage=Number(saved.damage)||25;p.defense=Number(saved.defense)||0;p.fireRate=Number(saved.fireRate)||280;
          p.score=saved.score;p.kills=saved.kills;p.xp=saved.xp;p.pvpKills=Number(saved.pvpKills)||0;p.gold=Number(saved.gold)||0;p.bankedGold=Number(saved.bankedGold)||0;p.ammo=Math.max(0,Math.min(MAX_AMMO,Number(saved.ammo)??60));p.weapon=WEAPONS[saved.weapon]?saved.weapon:"blaster";p.damage=WEAPONS[p.weapon].damage+(p.level-1)*5;p.fireRate=Math.max(100,WEAPONS[p.weapon].fireRate-(p.level-1)*4);
        }
        p.color=String(msg.color||"#39e7ff");
        if(msg.room) joinRoom(ws,msg.room,false);
        else if(msg.createRoom) joinRoom(ws,"",true);
        else joinRoom(ws,"OPEN",false);
        if(p.room) { broadcastRoom(p.room,{type:"player_update",player:p},ws); sendPlayerList(p.room); }
      }

      if(msg.type==="create_room") joinRoom(ws,"",true);
      if(msg.type==="join_room") joinRoom(ws,msg.code,false);

      if(msg.type==="state" && p.room && !p.frozen){
        p.x=clamp(Number.isFinite(msg.x)?msg.x:p.x,35,WORLD.w-35);
        p.y=clamp(Number.isFinite(msg.y)?msg.y:p.y,35,WORLD.h-35);
        p.angle=Number.isFinite(msg.angle)?msg.angle:p.angle;
        // Progresión, daño, defensa y cadencia son autoritativos del servidor.
        // El cliente solo reporta posición y dirección.
        // El servidor mantiene el HP autoritativo; no aceptar HP del cliente.
        broadcastRoom(p.room,{type:"player_update",player:p},ws);
        sendPlayerList(p.room);
      }

      if(msg.type==="fire" && !p.frozen) handleShot(ws);
      if(msg.type==="buy_ammo" && !p.frozen) buyAmmo(ws);
      if(msg.type==="buy_weapon" && !p.frozen) shopBuy(ws,msg.weapon);
      if(msg.type==="deposit_gold" && !p.frozen) depositGold(ws);

      if(msg.type==="save" && p.room){
        p.frozen=true;
        p.angle=Number.isFinite(msg.angle)?msg.angle:p.angle;
        p.hp=clamp(Number.isFinite(msg.hp)?msg.hp:p.hp,0,100);
        const data={
          name:p.name,x:p.x,y:p.y,level:p.level,hp:p.hp,damage:p.damage,defense:p.defense,fireRate:p.fireRate,
          score:p.score,kills:p.kills,xp:p.xp,pvpKills:p.pvpKills,gold:p.gold||0,bankedGold:p.bankedGold||0,ammo:p.ammo||0,weapon:p.weapon||"blaster"
        };
        if(p.saveKey)savedPlayers.set(p.saveKey,data);
        send(ws,{type:"save_ok",savedAt:Date.now(),data});
        broadcastRoom(p.room,{type:"player_update",player:p});
        sendPlayerList(p.room);
      }

      if(msg.type==="resume" && p.room){
        p.frozen=false;
        send(ws,{type:"resume_ok"});
      }

      if(msg.type==="respawn" && p.room){
        const spawn=spawnPosition(p.room);
        p.x=spawn.x;p.y=spawn.y;p.angle=0;p.hp=100;p.alive=true;
        p.level=1;p.damage=25;p.defense=0;p.fireRate=280;p.xp=0;p.score=0;p.kills=0;p.pvpKills=0;p.ammo=Math.max(30,Math.min(MAX_AMMO,p.ammo||0));p.lastShot=0;
        send(ws,{type:"respawn_ok",x:p.x,y:p.y,hp:p.hp,enemies:ensureRoomEnemies(p.room),safeZone:SAFE_ZONE,spawnProtectionMs:5000});
        sendStats(p);
        broadcastRoom(p.room,{type:"player_update",player:p},ws);
        sendPlayerList(p.room);
      }
    }catch{}
  });

  ws.on("close",()=>{
    leaveRoom(ws);
    clients.delete(ws);
  });
});

setInterval(()=>{
  const dt=.05;
  for(const [code,room] of rooms){
    if(!room.size)continue;
    const enemies=ensureRoomEnemies(code);
    const players=roomPlayers(room).filter(p=>p.alive&&!p.frozen);
    for(const enemy of enemies){
      let target=null,best=Infinity;
      for(const pl of players){
        const d=Math.hypot(pl.x-enemy.x,pl.y-enemy.y);
        if(d<best){best=d;target=pl;}
      }
      if(target && inSafeZone(target.x,target.y,24)) target=null;
      if(target){
        const dx=(target.x-enemy.x)/Math.max(best,1),dy=(target.y-enemy.y)/Math.max(best,1);
        enemy.vx=dx*enemy.speed;
        enemy.vy=dy*enemy.speed;
        enemy.x=clamp(enemy.x+enemy.vx*dt,35,WORLD.w-35);
        enemy.y=clamp(enemy.y+enemy.vy*dt,35,WORLD.h-35);
        if(inSafeZone(enemy.x,enemy.y,enemy.r)){
          const dx=enemy.x-SAFE_ZONE.x,dy=enemy.y-SAFE_ZONE.y,d=Math.max(1,Math.hypot(dx,dy));
          enemy.x=SAFE_ZONE.x+(dx/d)*(SAFE_ZONE.r+enemy.r+4);
          enemy.y=SAFE_ZONE.y+(dy/d)*(SAFE_ZONE.r+enemy.r+4);
        }
        if(best<enemy.r+24){
          target.hp=clamp(target.hp-Math.max(.5,enemy.damage-(target.defense||0))*dt,0,100);
          send(findPlayer(target.id,room)?.ws||null,{type:"pve_damage",amount:enemy.damage*dt,hp:target.hp});
          if(target.hp<=0 && target.alive && !target.frozen){
            target.alive=false;
            const lostScore=target.score||0;
            target.level=1;target.hp=0;target.damage=25;target.defense=0;target.fireRate=280;target.xp=0;target.score=0;target.kills=0;target.pvpKills=0;
            const found=findPlayer(target.id,room);
            if(found)send(found.ws,{type:"pve_dead,lostScore".replace(",",":")});
            if(found)send(found.ws,{type:"pve_dead",lostScore});
          }
        }
      }
    }
    while(enemies.length<18)enemies.push(makeEnemy());
    broadcastRoom(code,{type:"enemy_state",enemies});
  }
},50);

httpServer.listen(PORT,()=>console.log("Neon Core multiplayer server listening on "+PORT));
