const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const WORLD = {w:3000,h:2200};
const MAX_PLAYERS = 16;
const clients = new Map();
const rooms = new Map();
rooms.set("OPEN",new Set());
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
    if(room.size===0 && code!=="OPEN") rooms.delete(code);
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
  p.room=code;
  p.hp=100;
  p.alive=true;
  send(ws,{type:"room_joined",code,players:roomPlayers(room)});
  broadcastRoom(code,{type:"player_join",player:p},ws);
  sendPlayerList(code);
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
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
  let target=null,best=Infinity;

  for(const otherWs of room){
    const targetPlayer=clients.get(otherWs);
    if(!targetPlayer || targetPlayer===shooter || !targetPlayer.alive)continue;
    const dx=targetPlayer.x-shooter.x,dy=targetPlayer.y-shooter.y;
    const d=Math.hypot(dx,dy);
    if(d>maxRange)continue;
    let diff=Math.atan2(dy,dx)-shooter.angle;
    diff=Math.atan2(Math.sin(diff),Math.cos(diff));
    const hitWidth=.16 + 24/Math.max(d,60);
    if(Math.abs(diff)<=hitWidth && d<best){
      best=d;
      target={ws:otherWs,p:targetPlayer};
    }
  }

  broadcastRoom(shooter.room,{
    type:"player_shot",
    id:shooter.id,
    x:shooter.x,
    y:shooter.y,
    angle:shooter.angle
  });

  if(!target)return;

  target.p.hp=clamp(target.p.hp-damage,0,100);
  send(target.ws,{type:"pvp_damage",from:shooter.id,amount:damage,hp:target.p.hp});
  broadcastRoom(shooter.room,{
    type:"pvp_hit",
    shooter:shooter.id,
    target:target.p.id,
    amount:damage,
    hp:target.p.hp
  });

  if(target.p.hp<=0){
    target.p.alive=false;
    shooter.kills=(shooter.kills||0)+1;
    shooter.score=(shooter.score||0)+25;
    shooter.xp=(shooter.xp||0)+40;
    send(target.ws,{type:"pvp_dead",killer:shooter.name});
    broadcastRoom(shooter.room,{
      type:"pvp_kill",
      killer:shooter.id,
      target:target.p.id
    });
    send(shooter.ws,{type:"server_stats",kills:shooter.kills,score:shooter.score,xp:shooter.xp});
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
    id,name:"Jugador",x:1500,y:1100,angle:0,hp:100,level:1,
    damage:25,fireRate:280,score:0,kills:0,xp:0,
    color:"#39e7ff",room:"",alive:true,lastShot:0
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
        p.color=String(msg.color||"#39e7ff");
        if(msg.room) joinRoom(ws,msg.room,false);
        else if(msg.createRoom) joinRoom(ws,"",true);
        else joinRoom(ws,"OPEN",false);
        if(p.room) { broadcastRoom(p.room,{type:"player_update",player:p},ws); sendPlayerList(p.room); }
      }

      if(msg.type==="create_room") joinRoom(ws,"",true);
      if(msg.type==="join_room") joinRoom(ws,msg.code,false);

      if(msg.type==="state" && p.room){
        p.x=clamp(Number.isFinite(msg.x)?msg.x:p.x,35,WORLD.w-35);
        p.y=clamp(Number.isFinite(msg.y)?msg.y:p.y,35,WORLD.h-35);
        p.angle=Number.isFinite(msg.angle)?msg.angle:p.angle;
        p.level=clamp(Number(msg.level)||1,1,1000);
        p.damage=clamp(Number(msg.damage)||25,10,150);
        p.fireRate=clamp(Number(msg.fireRate)||280,100,500);
        if(p.alive)p.hp=clamp(Number.isFinite(msg.hp)?msg.hp:p.hp,0,100);
        broadcastRoom(p.room,{type:"player_update",player:p},ws);
        sendPlayerList(p.room);
      }

      if(msg.type==="fire") handleShot(ws);

      if(msg.type==="respawn" && p.room){
        p.x=1500;p.y=1100;p.angle=0;p.hp=100;p.alive=true;p.lastShot=0;
        send(ws,{type:"respawn_ok",x:p.x,y:p.y,hp:p.hp});
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
  for(const [code,room] of rooms){
    if(room.size) broadcastRoom(code,{type:"server_time",players:roomPlayers(room).length});
  }
},1000);

httpServer.listen(PORT,()=>console.log("Neon Core multiplayer server listening on "+PORT));
