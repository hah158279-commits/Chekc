'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = __dirname;
// Minimal .env loader (no third-party dependency). Existing process env wins.
try { for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if(m && process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^(['"])(.*)\1$/, '$2'); } } catch {}
const DATA = path.join(ROOT, 'data.json');
const PORT = Number(process.env.PORT || 8080);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-admin-password';
const APP_PASSWORD = process.env.APP_PASSWORD || '후이vip👑';
const SESSION_SECRET = process.env.SESSION_SECRET || 'development-only-change-me';
let db = { keys: [], usage: {}, sessions: {}, history: {}, roomFiles: {}, loyalty: {}, coupons: {}, missions: {}, missionSubmissions: {} };
try { if (fs.existsSync(DATA)) db = { ...db, ...JSON.parse(fs.readFileSync(DATA, 'utf8')) }; } catch { console.error('data.json is invalid; starting with empty data'); }
function save(){ fs.writeFileSync(DATA, JSON.stringify(db, null, 2), { mode: 0o600 }); }
function token(role){ const raw=crypto.randomBytes(32).toString('hex'); return raw+'.'+crypto.createHmac('sha256',SESSION_SECRET).update(raw+':'+role).digest('hex'); }
function validToken(t, role){ if(!t||typeof t!=='string')return false; const [raw, sig]=t.split('.'); if(!raw||!sig||sig.length!==64)return false; const expected=crypto.createHmac('sha256',SESSION_SECRET).update(raw+':'+role).digest('hex'); if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false; const s=db.sessions[t]; return !!s&&s.role===role&&s.expires>Date.now(); }
function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));}
function send(res,status,obj,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(obj));}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>30e6){reject(new Error('Tệp quá lớn; giới hạn upload 20 MB'));req.destroy();}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch{reject(new Error('Invalid JSON'))}});});}
function auth(req,role){const c=parseCookies(req);return validToken(c[role==='admin'?'hui_admin':'hui_user'],role);}
function userSessionToken(req){return parseCookies(req).hui_user||'';}
function setSession(res,role){const t=token(role);db.sessions[t]={role,expires:Date.now()+12*60*60*1000};save();const name=role==='admin'?'hui_admin':'hui_user';res.setHeader('Set-Cookie',`${name}=${encodeURIComponent(t)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${process.env.NODE_ENV==='production'?'; Secure':''}`);}
function keyCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='HUI';for(let i=0;i<4;i++){out+='-';for(let j=0;j<4;j++)out+=chars[crypto.randomInt(chars.length)];}return out;}
function cleanKey(k){return {id:k.id,key:k.key,kind:k.kind,product:k.product,fileId:k.fileId||null,customer:k.customer,duration:k.duration,price:k.price,createdAt:k.createdAt,expiresAt:k.expiresAt,status:k.status,activatedAt:k.activatedAt||null,device:k.device||null};}
const privateFiles={'hook-mic':'Hook mic.md','tool-dame-fb':'Tool dame fb.js','tool-spam-mes':'Tool spam mes.js'};
const roomLabels={'hook-mic':'Hook Mic','tool-dame-fb':'FB Safety Tools','tool-spam-mes':'Messenger Tools'};
function loyaltyFor(session){db.loyalty ||= {};db.loyalty[session] ||= {coins:0,spent:0,redeemed:[],createdAt:new Date().toISOString()};return db.loyalty[session];}
function levelFor(spent){return spent>=5000000?'DIAMOND':spent>=2000000?'PLATINUM':spent>=1000000?'GOLD':spent>=300000?'SILVER':'BRONZE';}
function publicCoupon(c){return {code:c.code,percent:c.percent,expiresAt:c.expiresAt,usesLeft:c.maxUses-c.used,active:c.active};}
const uploadDir=path.join(ROOT,'private-files','uploads');
fs.mkdirSync(uploadDir,{recursive:true});
function roomInfo(id){const latest=db.roomFiles[id]||null;return {id,name:latest?.title||roomLabels[id],version:latest?.version||'Chưa có bản cập nhật',price:300000,hasFile:!!latest,uploadedAt:latest?.uploadedAt||null};}
function dayKey(){return new Date().toISOString().slice(0,10);}
function normalizeFacebookPageId(input){
  const s=String(input||'').trim();
  if(/^\d{5,}$/.test(s))return s;
  try { const u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s); const parts=u.pathname.split('/').filter(Boolean); if(!parts.length)return null; const first=parts[0].replace(/^@/,''); if(/^\d{5,}$/.test(first))return first; return first; } catch { return null; }
}
function normalizeTikTokUsername(input){
  const s=String(input||'').trim();
  if(/^@?[A-Za-z0-9._]{2,30}$/.test(s))return s.replace(/^@/,'');
  try { const u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s); if(!/(^|\.)tiktok\.com$/i.test(u.hostname))return null; const m=u.pathname.match(/^\/@?([A-Za-z0-9._]{2,30})/); return m?m[1]:null; } catch { return null; }
}
async function facebookLiveCheck(input){
  const pageId=normalizeFacebookPageId(input);
  if(!pageId)return {input,status:'KHÔNG XÁC ĐỊNH',detail:'ID/link Facebook không hợp lệ.'};
  const accessToken=process.env.FACEBOOK_PAGE_ACCESS_TOKEN||process.env.FACEBOOK_GRAPH_TOKEN;
  if(!accessToken)return {input,status:'CHƯA CẤU HÌNH API',detail:'Cần cấu hình FACEBOOK_PAGE_ACCESS_TOKEN có quyền đọc LIVE của Page.'};
  const version=process.env.FACEBOOK_GRAPH_VERSION||'v26.0';
  const url=new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/live_videos`);
  url.searchParams.set('fields','id,status,title'); url.searchParams.set('limit','10'); url.searchParams.set('access_token',accessToken);
  try {
    const r=await fetch(url,{signal:AbortSignal.timeout(12000)}); const d=await r.json();
    if(!r.ok||d.error)return {input,status:'KHÔNG XÁC ĐỊNH',detail:`Facebook API không cho phép xác minh: ${String(d.error?.message||r.statusText||'API error').slice(0,180)}`};
    const live=(d.data||[]).some(v=>String(v.status||'').toUpperCase()==='LIVE_NOW');
    return {input,status:live?'LIVE':'DIE',detail:live?'Page có phiên LIVE_NOW theo Graph API.':'API truy vấn thành công nhưng không có phiên LIVE_NOW trong danh sách trả về.'};
  } catch(e){return {input,status:'KHÔNG XÁC ĐỊNH',detail:`Không kết nối được Facebook API: ${e.message}`};}
}
async function tiktokLiveCheck(input){
  const username=normalizeTikTokUsername(input);
  if(!username)return {input,status:'KHÔNG XÁC ĐỊNH',detail:'Username/link TikTok không hợp lệ.'};
  const endpoint=process.env.TIKTOK_LIVE_CHECK_URL;
  const apiKey=process.env.TIKTOK_LIVE_API_KEY;
  if(!endpoint)return {input,status:'CHƯA CẤU HÌNH API',detail:'TikTok chưa có endpoint checker cấu hình. Thiết lập TIKTOK_LIVE_CHECK_URL và kiểm tra hợp đồng API.'};
  try {
    const headers={'Content-Type':'application/json','Accept':'application/json'};
    if(apiKey)headers[process.env.TIKTOK_LIVE_API_KEY_HEADER||'Authorization']=process.env.TIKTOK_LIVE_API_KEY_HEADER==='Authorization'?`Bearer ${apiKey}`:apiKey;
    const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({username}),signal:AbortSignal.timeout(15000)});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d)return {input,status:'KHÔNG XÁC ĐỊNH',detail:`TikTok provider trả HTTP ${r.status} hoặc JSON không hợp lệ.`};
    const raw=String(d.status??d.live_status??d.data?.status??d.data?.live_status??'').toUpperCase();
    const live=d.is_live===true||d.data?.is_live===true||['LIVE','LIVE_NOW','ONLINE','TRUE','1'].includes(raw);
    const offline=d.is_live===false||d.data?.is_live===false||['DIE','OFFLINE','NOT_LIVE','FALSE','0'].includes(raw);
    if(live)return {input,status:'LIVE',detail:'Provider xác nhận tài khoản đang LIVE.'};
    if(offline)return {input,status:'DIE',detail:'Provider xác nhận tài khoản hiện không LIVE.'};
    return {input,status:'KHÔNG XÁC ĐỊNH',detail:'Phản hồi provider không có status/is_live được hỗ trợ. Xem README để cấu hình đúng định dạng.'};
  } catch(e){return {input,status:'KHÔNG XÁC ĐỊNH',detail:`Không kết nối được TikTok provider: ${e.message}`};}
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&['/getkey','/meta'].includes(url.pathname)){res.writeHead(302,{Location:url.pathname+'/','Cache-Control':'no-store'});return res.end();}
  if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,service:'후이 meta + GetKey',mode:'prototype'});
  try {
    if(req.method==='POST'&&url.pathname==='/api/login'){const b=await body(req);if(b.password!==APP_PASSWORD)return send(res,401,{error:'Mật khẩu không đúng.'});setSession(res,'user');return send(res,200,{ok:true});}
    if(req.method==='POST'&&url.pathname==='/api/admin/login'){const b=await body(req);if(b.password!==ADMIN_PASSWORD)return send(res,401,{error:'Mật khẩu admin không đúng.'});setSession(res,'admin');return send(res,200,{ok:true});}
    if(req.method==='POST'&&url.pathname==='/api/logout'){const c=parseCookies(req);for(const n of ['hui_user','hui_admin'])if(c[n])delete db.sessions[c[n]];save();res.setHeader('Set-Cookie',['hui_user=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0','hui_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0']);return send(res,200,{ok:true});}
    if(url.pathname.startsWith('/api/admin/')){
      if(!auth(req,'admin'))return send(res,401,{error:'Cần đăng nhập admin.'});
      if(req.method==='GET'&&url.pathname==='/api/admin/keys')return send(res,200,{keys:db.keys.map(cleanKey)});
      if(req.method==='GET'&&url.pathname==='/api/admin/rooms')return send(res,200,{rooms:Object.keys(privateFiles).map(roomInfo)});
      if(req.method==='GET'&&url.pathname==='/api/admin/loyalty'){return send(res,200,{customers:Object.entries(db.loyalty||{}).map(([session,v])=>({session:session.slice(0,10)+'…',coins:v.coins||0,spent:v.spent||0,level:levelFor(v.spent||0)})),coupons:Object.values(db.coupons||{}).map(publicCoupon),missions:Object.values(db.missions||{}),submissions:Object.values(db.missionSubmissions||{})});}
      if(req.method==='POST'&&url.pathname==='/api/admin/coupons'){const b=await body(req);const code=String(b.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32);const percent=Math.max(1,Math.min(90,Number(b.percent)||10));const maxUses=Math.max(1,Math.min(100000,Number(b.maxUses)||1));const expiresAt=b.expiresAt?new Date(b.expiresAt).toISOString():new Date(Date.now()+30*86400000).toISOString();if(code.length<4)return send(res,400,{error:'Mã giảm giá cần ít nhất 4 ký tự.'});db.coupons[code]={code,percent,maxUses,used:0,expiresAt,active:true,usedBy:[]};save();return send(res,201,{coupon:publicCoupon(db.coupons[code])});}
      if(req.method==='POST'&&url.pathname==='/api/admin/missions'){const b=await body(req);const title=String(b.title||'').trim().slice(0,100);const urlText=String(b.url||'').trim().slice(0,500);const reward=Math.max(1,Math.min(10000,Number(b.reward)||10));if(!title)return send(res,400,{error:'Nhập tên nhiệm vụ.'});const m={id:crypto.randomUUID(),title,url:urlText,reward,active:true,createdAt:new Date().toISOString()};db.missions[m.id]=m;save();return send(res,201,{mission:m});}
      if(req.method==='POST'&&url.pathname.startsWith('/api/admin/missions/')&&url.pathname.endsWith('/approve')){const id=url.pathname.split('/')[4];const sub=db.missionSubmissions[id];if(!sub)return send(res,404,{error:'Không tìm thấy bài gửi.'});if(sub.status==='approved')return send(res,409,{error:'Nhiệm vụ đã được duyệt.'});const m=db.missions[sub.missionId];if(!m)return send(res,404,{error:'Nhiệm vụ không còn tồn tại.'});const profile=loyaltyFor(sub.session);profile.coins+=m.reward;sub.status='approved';sub.approvedAt=new Date().toISOString();sub.reward=m.reward;save();return send(res,200,{ok:true,submission:sub,coins:profile.coins});}
      if(req.method==='POST'&&url.pathname.startsWith('/api/admin/coupons/')&&url.pathname.endsWith('/toggle')){const code=decodeURIComponent(url.pathname.split('/')[4]||'');const c=db.coupons[code];if(!c)return send(res,404,{error:'Không tìm thấy mã.'});c.active=!c.active;save();return send(res,200,{coupon:publicCoupon(c)});}

      if(req.method==='POST'&&url.pathname==='/api/admin/rooms/upload'){
        const b=await body(req);
        const roomId=String(b.roomId||'');
        if(!Object.hasOwn(privateFiles,roomId))return send(res,400,{error:'Chọn đúng phòng file.'});
        const title=String(b.title||roomLabels[roomId]).trim().slice(0,80);
        const version=String(b.version||'V1').trim().slice(0,30);
        const originalName=String(b.fileName||'').split(/[\\/]/).pop().slice(0,180);
        const data=String(b.data||'');
        const m=data.match(/^data:([^;,]+)?;base64,([A-Za-z0-9+/=]+)$/);
        if(!m)return send(res,400,{error:'Dữ liệu file không hợp lệ.'});
        const buf=Buffer.from(m[2],'base64');
        if(!buf.length||buf.length>20*1024*1024)return send(res,400,{error:'File rỗng hoặc lớn hơn 20 MB.'});
        const storedName=roomId+'-'+crypto.randomBytes(8).toString('hex')+'.bin';
        fs.writeFileSync(path.join(uploadDir,storedName),buf,{mode:0o600});
        db.roomFiles[roomId]={roomId,title,version,originalName:originalName||'download.bin',storedName,size:buf.length,uploadedAt:new Date().toISOString()};
        save();
        return send(res,200,{ok:true,room:roomInfo(roomId)});
      }

      if(req.method==='POST'&&url.pathname==='/api/admin/keys'){const b=await body(req);const kind=['check','file'].includes(b.kind)?b.kind:'check';const fileId=kind==='file'&&Object.hasOwn(privateFiles,b.fileId)?b.fileId:null;if(kind==='file'&&!fileId)return send(res,400,{error:'Chọn đúng file cần cấp key.'});const product=kind==='file'?fileId:['facebook','tiktok'].includes(b.product)?b.product:'facebook';const days=kind==='file'?null:Math.max(1,Math.min(366,+b.days||1));const price=kind==='file'?300000:days<=1?20000:days<=7?70000:days<=31?150000:400000;const now=Date.now();const k={id:crypto.randomUUID(),key:keyCode(),kind,product,fileId,customer:String(b.customer||'').slice(0,100),duration:kind==='file'?'File riêng · không hết hạn':`${days} ngày`,durationDays:days,price,createdAt:new Date(now).toISOString(),expiresAt:null,status:'Chưa kích hoạt',activatedAt:null,device:null};db.keys.unshift(k);save();return send(res,201,{key:cleanKey(k)});}
      const m=url.pathname.match(/^\/api\/admin\/keys\/([\w-]+)\/revoke$/);if(req.method==='POST'&&m){const k=db.keys.find(x=>x.id===m[1]);if(!k)return send(res,404,{error:'Không tìm thấy key.'});if(k.status==='Đã thu hồi'){k.status='Chưa kích hoạt';k.sessionToken=null;k.activatedAt=null;k.expiresAt=null;k.device=null;}else{k.status='Đã thu hồi';k.sessionToken=null;}save();return send(res,200,{key:cleanKey(k)});}
      if(req.method==='GET'&&url.pathname==='/api/admin/export'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="hui-getkey.csv"'});const rows=[['key','kind','product','customer','duration','price','status','expiresAt'],...db.keys.map(k=>[k.key,k.kind,k.product,k.customer,k.duration,k.price,k.status,k.expiresAt||''])];return res.end('\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'));}
    }
    if(req.method==='GET'&&url.pathname==='/api/rooms'){
      if(!auth(req,'user'))return send(res,401,{error:'Hãy đăng nhập app trước.'});
      return send(res,200,{rooms:Object.keys(privateFiles).map(roomInfo)});
    }
    if(req.method==='POST'&&url.pathname==='/api/file-download'){
      if(!auth(req,'user'))return send(res,401,{error:'Hãy đăng nhập app trước.'});
      const b=await body(req);const fileId=String(b.fileId||'');const key= db.keys.find(x=>x.key.toUpperCase()===String(b.key||'').trim().toUpperCase());
      if(!Object.hasOwn(privateFiles,fileId))return send(res,404,{error:'Không tìm thấy file.'});
      if(!key||key.kind!=='file'||key.product!==fileId||key.status==='Đã thu hồi')return send(res,403,{error:'Key không đúng phòng hoặc đã bị thu hồi.'});
      const currentSession=userSessionToken(req);
      if(key.expiresAt&&Date.now()>Date.parse(key.expiresAt))return send(res,403,{error:'Key đã hết hạn.'});
      if(key.sessionToken&&key.sessionToken!==currentSession)return send(res,403,{error:'Key này đã được kích hoạt trên phiên/thiết bị khác.'});
      if(!key.sessionToken){key.status='Đang hoạt động';key.sessionToken=currentSession;key.activatedAt=new Date().toISOString();key.device='GETKEY customer session';save();}
      const uploaded=db.roomFiles[fileId];
      const filePath=uploaded?path.join(uploadDir,uploaded.storedName):path.join(ROOT,'private-files',privateFiles[fileId]);
      const downloadName=uploaded?.originalName||privateFiles[fileId];
      fs.readFile(filePath,(err,data)=>{if(err)return send(res,404,{error:'Phòng này chưa có file tải lên.'});res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);});return;
    }
    if(url.pathname.startsWith('/api/')){
      if(!auth(req,'user'))return send(res,401,{error:'Hãy đăng nhập app trước.'});
      if(req.method==='GET'&&url.pathname==='/api/usage'){const d=dayKey();const session=userSessionToken(req);const u=(db.usage[d]||{})[session]||{};return send(res,200,{date:d,facebook:u.facebook||0,tiktok:u.tiktok||0,freeLimit:5});}
      if(req.method==='GET'&&url.pathname==='/api/loyalty'){const session=userSessionToken(req);const profile=loyaltyFor(session);return send(res,200,{coins:profile.coins||0,spent:profile.spent||0,level:levelFor(profile.spent||0),coupons:Object.values(db.coupons||{}).filter(c=>c.active&&Date.parse(c.expiresAt)>Date.now()&&c.used<c.maxUses).map(c=>({code:c.code,percent:c.percent,expiresAt:c.expiresAt})),missions:Object.values(db.missions||{}).filter(m=>m.active),mySubmissions:Object.values(db.missionSubmissions||{}).filter(x=>x.session===session).map(x=>({id:x.id,missionId:x.missionId,status:x.status,reward:x.reward||0}))});}
      if(req.method==='POST'&&url.pathname==='/api/coupons/redeem'){const b=await body(req);const code=String(b.code||'').trim().toUpperCase();const c=db.coupons?.[code];const session=userSessionToken(req);const profile=loyaltyFor(session);if(!c||!c.active)return send(res,404,{error:'Mã giảm giá không hợp lệ.'});if(Date.parse(c.expiresAt)<=Date.now())return send(res,410,{error:'Mã giảm giá đã hết hạn.'});if(c.used>=c.maxUses)return send(res,409,{error:'Mã giảm giá đã hết lượt.'});if(c.usedBy.includes(session))return send(res,409,{error:'Tài khoản/phiên này đã dùng mã.'});c.usedBy.push(session);c.used++;profile.redeemed.push({code,at:new Date().toISOString(),percent:c.percent});save();return send(res,200,{ok:true,code,percent:c.percent,message:`Mã ${code} hợp lệ, mức giảm ${c.percent}%. Chưa có cổng thanh toán tự động; admin cần áp dụng mức giảm khi xác nhận đơn hàng.`});}
      if(req.method==='POST'&&url.pathname==='/api/missions/submit'){const b=await body(req);const session=userSessionToken(req);const m=db.missions?.[String(b.missionId||'')];if(!m||!m.active)return send(res,404,{error:'Nhiệm vụ không tồn tại.'});const evidence=String(b.evidence||'').trim().slice(0,1000);if(evidence.length<4)return send(res,400,{error:'Gửi link/bằng chứng hoàn thành để admin xác minh.'});const prior=Object.values(db.missionSubmissions||{}).find(x=>x.session===session&&x.missionId===m.id&&x.status!=='rejected');if(prior)return send(res,409,{error:'Bạn đã gửi nhiệm vụ này rồi.'});const sub={id:crypto.randomUUID(),missionId:m.id,session,evidence,status:'pending',submittedAt:new Date().toISOString()};db.missionSubmissions[sub.id]=sub;save();return send(res,201,{ok:true,submission:{id:sub.id,status:sub.status}});}

      if(req.method==='GET'&&url.pathname==='/api/history'){const token=userSessionToken(req);return send(res,200,{history:(db.history[token]||[]).slice(0,100)});}
      if(req.method==='GET'&&url.pathname==='/api/my-keys'){const token=userSessionToken(req);const now=Date.now();const active=db.keys.filter(k=>k.kind==='check'&&k.status==='Đang hoạt động'&&k.sessionToken===token&&(!k.expiresAt||now<=Date.parse(k.expiresAt))).map(k=>({product:k.product,duration:k.duration,expiresAt:k.expiresAt,status:k.status,activatedAt:k.activatedAt}));return send(res,200,{keys:active});}
      if(req.method==='POST'&&url.pathname==='/api/activate'){const b=await body(req);const k=db.keys.find(x=>x.key.toUpperCase()===String(b.key||'').trim().toUpperCase());if(!k)return send(res,404,{error:'Key không tồn tại.'});if(k.status==='Đã thu hồi')return send(res,403,{error:'Key đã bị thu hồi.'});if(k.expiresAt&&Date.now()>Date.parse(k.expiresAt))return send(res,403,{error:'Key đã hết hạn.'});const sessionToken=userSessionToken(req);const device=String(b.device||'Thiết bị người dùng').slice(0,120);if(k.sessionToken&&k.sessionToken!==sessionToken)return send(res,403,{error:'Key đã được kích hoạt trên thiết bị/phiên khác. Liên hệ admin nếu cần chuyển thiết bị.'});if(k.kind==='file'){if(k.product!==b.product)return send(res,403,{error:'Key không đúng file đã mua.'});if(k.status==='Chưa kích hoạt'){k.status='Đang hoạt động';k.activatedAt=new Date().toISOString();k.device=device;k.sessionToken=sessionToken;save();}return send(res,200,{ok:true,kind:'file',product:k.product,message:'Key file hợp lệ.'});}if(k.product!==b.product)return send(res,403,{error:'Key không đúng nhóm công cụ.'});if(k.status==='Chưa kích hoạt'){k.status='Đang hoạt động';k.activatedAt=new Date().toISOString();k.device=device;k.sessionToken=sessionToken;if(k.kind==='check'&&k.durationDays)k.expiresAt=new Date(Date.now()+k.durationDays*86400000).toISOString();save();}return send(res,200,{ok:true,kind:k.kind,product:k.product,expiresAt:k.expiresAt});}
      if(req.method==='POST'&&url.pathname==='/api/check'){const b=await body(req);const product=['facebook','tiktok'].includes(b.product)?b.product:'facebook';const items=String(b.items||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,500);if(!items.length)return send(res,400,{error:'Nhập ít nhất một ID hoặc link.'});const day=dayKey();const token=userSessionToken(req);db.usage[day] ||= {};db.usage[day][token] ||= {};db.usage[day][token][product] ||= 0;const freeUsed=db.usage[day][token][product];const active=db.keys.some(k=>k.kind==='check'&&k.product===product&&k.status==='Đang hoạt động'&&k.sessionToken===token&&(!k.expiresAt||Date.now()<=Date.parse(k.expiresAt)));if(!active&&freeUsed+items.length>5)return send(res,402,{error:`Bạn còn ${Math.max(0,5-freeUsed)} lượt miễn phí hôm nay. Muốn kiểm tra thêm, hãy kích hoạt key ${product==='facebook'?'Facebook':'TikTok'} riêng.`,remaining:Math.max(0,5-freeUsed)});if(!active)db.usage[day][token][product]+=items.length;save();const results=[];for(const item of items){results.push(product==='facebook'?await facebookLiveCheck(item):await tiktokLiveCheck(item));}db.history[token] ||= [];db.history[token].unshift({id:crypto.randomUUID(),product,at:new Date().toISOString(),count:items.length,results});db.history[token]=db.history[token].slice(0,100);save();return send(res,200,{product,results,usage:{used:db.usage[day][product],freeLimit:5,remaining:Math.max(0,5-db.usage[day][product])}});}
    }
  }catch(e){return send(res,400,{error:e.message||'Yêu cầu không hợp lệ.'});}
  if(req.method==='GET'){
    let p=url.pathname==='/'?'/meta/':url.pathname;
    if(p==='/getkey')p='/getkey/';
    let file=path.resolve(ROOT,'public','.'+p);
    const publicRoot=path.resolve(ROOT,'public');
    if(!file.startsWith(publicRoot+path.sep))return send(res,403,{error:'Forbidden'});
    // Serve index.html for directory URLs such as /getkey/ and /meta/.
    try {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    } catch {}
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Không tìm thấy trang.');}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(data);});return;
  }
  return send(res,404,{error:'Not found'});
});
server.listen(PORT,()=>console.log(`후이 meta: http://localhost:${PORT}/meta/ · GetKey: http://localhost:${PORT}/getkey/`));
