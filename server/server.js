const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const clients = new Map();
const rooms = new Map();\nrooms.set("OPEN",new Set());
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
    if(room.size===0) rooms.delete(code);
    else broadcastRoom(code,{type:"player_leave",id:p.id});
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
  if(room.size>=16){
    send(ws,{type:"room_error",message:"Sala llena"});
    return;
  }
  leaveRoom(ws);
  room.add(ws);
  p.room=code;
  send(ws,{type:"room_joined",code,players:roomPlayers(room)});
  broadcastRoom(code,{type:"player_join",player:p},ws);
}

const httpServer=http.createServer((req,res)=>{
  if(req.url==="/health" || req.url==="/"){
    res.writeHead(200,{"Content-Type":"application/json"});
    return res.end(JSON.stringify({ok:true,game:"Neon Core",players:clients.size,rooms:rooms.size}));
  }
  res.writeHead(404);res.end();
});

const wss=new WebSocketServer({server:httpServer,path:"/ws"});

wss.on("connection",(ws)=>{
  const id=Math.random().toString(36).slice(2,10);
  const player={id,name:"Jugador",x:1500,y:1100,angle:0,hp:100,level:1,color:"#39e7ff",room:""};
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
        if(p.room) broadcastRoom(p.room,{type:"player_update",player:p});
      }

      if(msg.type==="create_room") joinRoom(ws,"",true);
      if(msg.type==="join_room") joinRoom(ws,msg.code,false);

      if(msg.type==="state" && p.room){
        p.x=Number.isFinite(msg.x)?msg.x:p.x;
        p.y=Number.isFinite(msg.y)?msg.y:p.y;
        p.angle=Number.isFinite(msg.angle)?msg.angle:p.angle;
        p.hp=Number.isFinite(msg.hp)?msg.hp:p.hp;
        p.level=Number.isFinite(msg.level)?msg.level:p.level;
        broadcastRoom(p.room,{type:"player_update",player:p},ws);
      }
    }catch{}
  });

  ws.on("close",()=>{
    leaveRoom(ws);
    clients.delete(ws);
  });
});

setInterval(()=>broadcastRoom("OPEN",{type:"server_time",players:roomPlayers(rooms.get("OPEN")||new Set()).length}),1000);
httpServer.listen(PORT,()=>console.log("Neon Core multiplayer server listening on "+PORT));
