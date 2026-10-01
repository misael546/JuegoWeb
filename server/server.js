const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const clients = new Map();

const httpServer = http.createServer((req,res)=>{
  res.writeHead(200, {"Content-Type":"application/json"});
  res.end(JSON.stringify({ok:true,game:"Neon Core",players:clients.size}));
});

const wss = new WebSocketServer({server:httpServer,path:"/ws"});

function send(ws,msg){
  if(ws.readyState===1) ws.send(JSON.stringify(msg));
}
function broadcast(msg,except=null){
  const data=JSON.stringify(msg);
  for(const ws of clients.keys()){
    if(ws!==except && ws.readyState===1) ws.send(data);
  }
}

wss.on("connection",(ws)=>{
  const id=Math.random().toString(36).slice(2,10);
  const player={id,name:"Jugador",x:1500,y:1100,angle:0,hp:100,level:1,color:"#39e7ff"};
  clients.set(ws,player);

  send(ws,{type:"welcome",id,players:[...clients.values()]});
  broadcast({type:"player_join",player},ws);

  ws.on("message",(raw)=>{
    try{
      const msg=JSON.parse(raw.toString());
      const p=clients.get(ws);
      if(!p)return;

      if(msg.type==="join"){
        p.name=String(msg.name||"Jugador").slice(0,20);
        p.color=String(msg.color||"#39e7ff");
        broadcast({type:"player_update",player:p});
      }

      if(msg.type==="state"){
        p.x=Number.isFinite(msg.x)?msg.x:p.x;
        p.y=Number.isFinite(msg.y)?msg.y:p.y;
        p.angle=Number.isFinite(msg.angle)?msg.angle:p.angle;
        p.hp=Number.isFinite(msg.hp)?msg.hp:p.hp;
        p.level=Number.isFinite(msg.level)?msg.level:p.level;
        broadcast({type:"player_update",player:p},ws);
      }
    }catch{}
  });

  ws.on("close",()=>{
    const p=clients.get(ws);
    clients.delete(ws);
    if(p)broadcast({type:"player_leave",id:p.id});
  });
});

setInterval(()=>{
  broadcast({type:"server_time",players:clients.size});
},1000);

httpServer.listen(PORT,()=>console.log("Neon Core multiplayer server listening on "+PORT));