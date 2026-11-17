import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const three=path.resolve(root,'node_modules/three');
const reference=null;
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webm':'video/webm'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
  let file;
  if(url.pathname==='/reference'){res.writeHead(404);return res.end();}
  else{
   const isThree=url.pathname.startsWith('/three/');
   const base=isThree?three:root;
   const relative=isThree?decodeURIComponent(url.pathname.slice(7)):['/','/play'].includes(url.pathname)?'level.html':decodeURIComponent(url.pathname.slice(1));
   file=path.resolve(base,relative);
   if(!file.startsWith(path.resolve(base)+path.sep)){res.writeHead(403);return res.end();}
  }
  const data=await fs.readFile(file);
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':data.length,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:"});
  res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',e=>{if(e.code==='EADDRINUSE')server.listen(0,'127.0.0.1');else throw e;});
server.listen(62940,'127.0.0.1',async()=>{
 const url=`http://127.0.0.1:${server.address().port}/`;
 await fs.writeFile(path.join(root,'url.json'),JSON.stringify({url,pid:process.pid})+'\n');
 console.log(`RealShot ${url}level.html`);
});
