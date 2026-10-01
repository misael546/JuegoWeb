const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const WORLD = {w:3000,h:2200};
const MAX_PLAYERS = 16;
const clients = new Map();
const savedPlayers = new Map();
const rooms = new Map();
const roomEnemies = new Map();
rooms.set("OPEN",new Set());
roomEnemies.set("OPEN",[]);
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
  return roomPlayers(room).map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,angle:p.angle,hp:p.hp,alive:p.alive,level:p.level,score:p.score,kills:p.kills,color:p.color}));
}
function sendPlayerList(code){
  broadcastRoom(code,{type:"player_list",players:publicPlayers(rooms.get(code)||new Set())});
}
function makeEnemy(){
  const elite=Math.random()<.2;
  const r=elite?27:21;
  const shapes=["square","triangle","hex"];\n  return {id:Math.random().toString(36).slice(2,10),x:Math.random()*(WORLD.w-200)+100,y:Math.random()*(WORLD.h-200)+100,r,hp:elite?85:50,maxHp:elite?85:50,speed:elite?55:75,damage:elite?14:9,kind:elite?"elite":"drone",shape:shapes[Math.floor(Math.random()*shapes.length)]};
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
    if(room.size===0 && code!=="OPEN"){ rooms.delete(code); roomEnemies.delete(code); }
    else { broadcastRoom(code,{type:"player_leave",id:p.id}); sendPlayerList(code); }
  }
  p.room="";
}
function joinRoom(ws,requestedCode,create=false){
  const p=clients.get(ws);
  if(!p)return;
  let code=String(requestedCode||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4);
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
  const spawn=spawnPosition(code);
  if(!p.hasSaved){p.x=spawn.x;p.y=spawn.y;p.hp=100;}
  p.angle=0;
  p.alive=true;
  p.hasSaved=false;
  send(ws,{type:"room_joined",code,players:publicPlayers(room),enemies:ensureRoomEnemies(code)});
  broadcastRoom(code,{type:"player_join",player:p},ws);
  sendPlayerList(code);
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function spawnPosition(code){
  const room=rooms.get(code)||new Set();
  const index=room.size;
  const spots=[
    [1400,1000],[1600,1000],[1400,1200],[1600,1200],
    [1250,1100],[1750,1100],[1500,900],[1500,1300],
    [1200,900],[1800,900],[1200,1300],[1800,1300],
    [1350,850],[1650,850],[1350,1350],[1650,1350]
  ];
  const s=spots[index%spots.length];
  return {x:s[0],y:s[1]};
}
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
    if(!targetPlayerData || targetPlayerData===shooter || !targetPlayerData.alive)continue;
    const dx=targetPlayerData.x-shooter.x,dy=targetPlayerData.y-shooter.y;
    const d=Math.hypot(dx,dy);
    if(d>maxRange)continue;
    let diff=Math.atan2(dy,dx)-shooter.angle;
    diff=Math.atan2(Math.sin(diff),Math.cos(diff));
    const hitWidth=.16 + 24/Math.max(d,60);
    if(Math.abs(diff)<=hitWidth && d<best){best=d;targetPlayer={ws:otherWs,p:targetPlayerData};}
  }

  const enemies=ensureRoomEnemies(shooter.room);
  for(const enemy of enemies){
    const dx=enemy.x-shooter.x,dy=enemy.y-shooter.y;
    const d=Math.hypot(dx,dy);
    if(d>maxRange)continue;
    let diff=Math.atan2(dy,dx)-shooter.angle;
    diff=Math.atan2(Math.sin(diff),Math.cos(diff));
    const hitWidth=.16 + enemy.r/Math.max(d,60);
    if(Math.abs(diff)<=hitWidth && d<best){best=d;targetEnemy=enemy;targetPlayer=null;}
  }

  broadcastRoom(shooter.room,{type:"player_shot",id:shooter.id,x:shooter.x,y:shooter.y,angle:shooter.angle});

  if(targetPlayer){
    targetPlayer.p.hp=clamp(targetPlayer.p.hp-damage,0,100);
    send(targetPlayer.ws,{type:"pvp_damage",from:shooter.id,amount:damage,hp:targetPlayer.p.hp});
    broadcastRoom(shooter.room,{type:"pvp_hit",shooter:shooter.id,target:targetPlayer.p.id,amount:damage,hp:targetPlayer.p.hp});
    if(targetPlayer.p.hp<=0){
      targetPlayer.p.alive=false;
      const lostScore=targetPlayer.p.score||0;
      targetPlayer.p.level=1;targetPlayer.p.hp=0;targetPlayer.p.damage=25;targetPlayer.p.fireRate=280;
      targetPlayer.p.xp=0;targetPlayer.p.score=0;targetPlayer.p.kills=0;
      shooter.kills=(shooter.kills||0)+1;shooter.score=(shooter.score||0)+25;shooter.xp=(shooter.xp||0)+40;
      send(targetPlayer.ws,{type:"pvp_dead",killer:shooter.name,lostScore});
      broadcastRoom(shooter.room,{type:"pvp_kill",killer:shooter.id,target:targetPlayer.p.id});
      send(shooter.ws,{type:"server_stats",kills:shooter.kills,score:shooter.score,xp:shooter.xp});
    }
    return;
  }

  if(targetEnemy){
    targetEnemy.hp=clamp(targetEnemy.hp-damage,0,targetEnemy.maxHp);
    broadcastRoom(shooter.room,{type:"enemy_hit",id:targetEnemy.id,hp:targetEnemy.hp});
    if(targetEnemy.hp<=0){
      const reward=targetEnemy.kind==="elite"?30:12;
      const xp=targetEnemy.kind==="elite"?35:20;
      const index=enemies.findIndex(e=>e.id===targetEnemy.id);
      if(index>=0)enemies.splice(index,1);
      shooter.kills=(shooter.kills||0)+1;shooter.score=(shooter.score||0)+reward;shooter.xp=(shooter.xp||0)+xp;
      send(shooter.ws,{type:"server_stats",kills:shooter.kills,score:shooter.score,xp:shooter.xp});
      broadcastRoom(shooter.room,{type:"enemy_dead",id:targetEnemy.id,killer:shooter.id});
    }
  }
}

const httpServer=http.createServer((req,res)=>{
  if(req.url==="/health" || req.url==="/"){
    res.writeHead(200,{"Content-Type":"application/json"});
    return res.end(JSON.stringify({
      ok:true,
      game:"Neon Core",
      players:clients.size,
      rooms:rooms.size,
      pvp:true
    }));
  }
  res.writeHead(404);res.end();
});

const wss=new WebSocketServer({server:httpServer,path:"/ws"});

wss.on("connection",(ws)=>{
  const id=Math.random().toString(36).slice(2,10);
  const player={
    id,name:"Jugador",saveKey:"",x:1500,y:1100,angle:0,hp:100,level:1,
    damage:25,fireRate:280,score:0,kills:0,xp:0,
    color:"#39e7ff",room:"",alive:true,frozen:false,lastShot:0
  };
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
          p.level=saved.level;p.hp=saved.hp;p.damage=saved.damage;p.fireRate=saved.fireRate;
          p.score=saved.score;p.kills=saved.kills;p.xp=saved.xp;
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
        p.level=clamp(Number(msg.level)||1,1,1000);
        p.damage=clamp(Number(msg.damage)||25,10,150);
        p.fireRate=clamp(Number(msg.fireRate)||280,100,500);
        // El servidor mantiene el HP autoritativo; no aceptar HP del cliente.
        broadcastRoom(p.room,{type:"player_update",player:p},ws);
        sendPlayerList(p.room);
      }

      if(msg.type==="fire" && !p.frozen) handleShot(ws);

      if(msg.type==="save" && p.room){
        p.frozen=true;
        p.angle=Number.isFinite(msg.angle)?msg.angle:p.angle;
        p.hp=clamp(Number.isFinite(msg.hp)?msg.hp:p.hp,0,100);
        const data={
          name:p.name,x:p.x,y:p.y,level:p.level,hp:p.hp,damage:p.damage,fireRate:p.fireRate,
          score:p.score,kills:p.kills,xp:p.xp
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
        p.level=1;p.damage=25;p.fireRate=280;p.xp=0;p.score=0;p.kills=0;p.lastShot=0;
        send(ws,{type:"respawn_ok",x:p.x,y:p.y,hp:p.hp,enemies:ensureRoomEnemies(p.room)});
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
  const dt=.1;
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
      if(target && best<700){
        const dx=(target.x-enemy.x)/Math.max(best,1),dy=(target.y-enemy.y)/Math.max(best,1);
        enemy.x=clamp(enemy.x+dx*enemy.speed*dt,35,WORLD.w-35);
        enemy.y=clamp(enemy.y+dy*enemy.speed*dt,35,WORLD.h-35);
        if(best<enemy.r+24){
          target.hp=clamp(target.hp-enemy.damage*dt,0,100);
          send(findPlayer(target.id,room)?.ws||null,{type:"pve_damage",amount:enemy.damage*dt,hp:target.hp});
          if(target.hp<=0 && target.alive && !target.frozen){
            target.alive=false;
            const lostScore=target.score||0;
            target.level=1;target.hp=0;target.damage=25;target.fireRate=280;target.xp=0;target.score=0;target.kills=0;
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
},100);

httpServer.listen(PORT,()=>console.log("Neon Core multiplayer server listening on "+PORT));
