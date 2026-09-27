const enc = new TextEncoder();
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
const random = () => crypto.randomUUID() + crypto.randomUUID();
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
const bytes = value => new Uint8Array(value.match(/../g).map(x => parseInt(x, 16)));
async function hashPassword(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(salt), iterations: 210000, hash: 'SHA-256' }, key, 256);
  return salt + ':' + hex(new Uint8Array(result));
}
async function verifyPassword(password, stored) {
  if (!stored || !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored)) return false;
  const computed = await hashPassword(password, stored.split(':')[0]);
  return crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(bytes(computed.split(':')[1]), bytes(stored.split(':')[1])) : computed === stored;
}
const cookie = (token, age) => `lordcity_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function current(request, db) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)lordcity_session=([^;]+)/)?.[1];
  if (!token) return null;
  return db.prepare('SELECT users.id, users.email, users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at > datetime(\'now\')').bind(await sha(token)).first();
}
async function body(request) {
  if (Number(request.headers.get('content-length') || 0) > 20000) throw new Error('Request too large');
  const text = await request.text();
  if (text.length > 20000) throw new Error('Request too large');
  return JSON.parse(text);
}
const clean = (value, max) => String(value || '').trim().slice(0, max);
const allowed = (user, section) => section === 'announcement' || section === 'theme' ? true : section === 'partner' ? ['admin','partner'].includes(user?.role) : section === 'mentorship' ? ['admin','mentee'].includes(user?.role) : false;
async function limited(db, key, max) {
  const now = Math.floor(Date.now()/1000), row = await db.prepare('SELECT attempts, window_start FROM login_attempts WHERE key=?').bind(key).first();
  if (row && now-row.window_start < 900 && row.attempts >= max) return true;
  await db.prepare('INSERT INTO login_attempts(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN ?-window_start>900 THEN 1 ELSE attempts+1 END, window_start=CASE WHEN ?-window_start>900 THEN ? ELSE window_start END').bind(key,now,now,now,now).run();
  return false;
}
export async function onRequest({ request, env, params }) {
  const db = env.DB;
  if (!db) return json({ error: 'Database connection is being configured.' }, 503);
  const path = '/' + (params.path || []).join('/');
  const method = request.method;
  if (!['GET','POST','DELETE'].includes(method)) return json({ error: 'Method not allowed' }, 405);
  if (method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403);
  try {
    const user = await current(request, db);
    if (path === '/me' && method === 'GET') return json({ user: user || null });
    if (path === '/bootstrap' && method === 'POST') {
      if (!env.ADMIN_SETUP_KEY || env.ADMIN_SETUP_KEY.length < 24) return json({ error: 'Admin setup key is not configured.' }, 503);
      const existing = await db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
      if (existing) return json({ error: 'Admin already exists.' }, 409);
      const ip = await sha(request.headers.get('CF-Connecting-IP') || 'unknown');
      if (await limited(db, 'bootstrap:' + ip, 5)) return json({ error: 'Too many attempts.' }, 429);
      const input = await body(request);
      if (input.setupKey !== env.ADMIN_SETUP_KEY || !/^\S+@\S+\.\S+$/.test(input.email || '') || String(input.password || '').length < 16) return json({ error: 'Invalid setup details. Use a password of at least 16 characters.' }, 400);
      await db.prepare("INSERT INTO users(email,password_hash,role) VALUES(?,?,'admin')").bind(clean(input.email, 200).toLowerCase(),await hashPassword(input.password)).run();
      return json({ ok: true }, 201);
    }
    if (path === '/login' && method === 'POST') {
      const input = await body(request), email = clean(input.email, 200).toLowerCase();
      const ip = await sha(request.headers.get('CF-Connecting-IP') || 'unknown');
      if (await limited(db,'login:' + ip,15)) return json({ error: 'Too many attempts. Try again later.' }, 429);
      const found = await db.prepare('SELECT id, password_hash FROM users WHERE email=?').bind(email).first();
      if (!found || !await verifyPassword(String(input.password || ''),found.password_hash)) return json({ error: 'Invalid login details.' }, 401);
      const token = random();
      await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(await sha(token),found.id).run();
      return json({ ok: true },200,{ 'set-cookie': cookie(token,604800) });
    }
    if (path === '/logout' && method === 'POST') {
      const token = request.headers.get('cookie')?.match(/(?:^|;\s*)lordcity_session=([^;]+)/)?.[1];
      if (token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();
      return json({ ok:true },200,{ 'set-cookie': cookie('',0) });
    }
    if (path === '/prayer' && method === 'POST') {
      const input = await body(request);
      if (input.website) return json({ ok:true });
      const ip = await sha(request.headers.get('CF-Connecting-IP') || 'unknown');
      if (await limited(db,'prayer:' + ip,5)) return json({ error:'Please try again later.' },429);
      const name=clean(input.name,100), message=clean(input.request,4000), contact=clean(input.contact,200);
      if (!name || message.length<10) return json({ error:'Please include your name and prayer request.' },400);
      await db.prepare('INSERT INTO prayer_requests(name,contact,request) VALUES(?,?,?)').bind(name,contact,message).run();
      return json({ ok:true },201);
    }
    if (path === '/theme' && method === 'GET') return json({ theme: (await db.prepare("SELECT value FROM settings WHERE key='theme'").first())?.value || 'Greater Level' });
    if (path === '/theme' && method === 'POST') {
      if (user?.role !== 'admin') return json({error:'Admin access required.'},403);
      const value=clean((await body(request)).theme,100); if (!value) return json({error:'Theme is required.'},400);
      await db.prepare("INSERT INTO settings(key,value) VALUES('theme',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(value).run();
      return json({ok:true});
    }
    if (path === '/content' && method === 'GET') {
      const section=new URL(request.url).searchParams.get('section');
      if (!allowed(user,section)) return json({error:'Access required.'},403);
      const rows=await db.prepare('SELECT id,title,body,published_at FROM content WHERE section=? ORDER BY published_at DESC,id DESC LIMIT 50').bind(section).all();
      return json({ items:rows.results });
    }
    if (path === '/content' && method === 'POST') {
      if (user?.role !== 'admin') return json({error:'Admin access required.'},403);
      const input=await body(request), section=input.section;
      if (!['announcement','partner','mentorship'].includes(section)) return json({error:'Invalid section.'},400);
      const title=clean(input.title,150), text=clean(input.body,10000);
      if (!title || !text) return json({error:'Title and body are required.'},400);
      await db.prepare('INSERT INTO content(section,title,body) VALUES(?,?,?)').bind(section,title,text).run();
      return json({ok:true},201);
    }
    if (path.startsWith('/content/') && method === 'DELETE') {
      if (user?.role !== 'admin') return json({error:'Admin access required.'},403);
      await db.prepare('DELETE FROM content WHERE id=?').bind(Number(path.split('/')[2]) || -1).run();
      return json({ok:true});
    }
    if (path === '/users' && method === 'GET') {
      if (user?.role !== 'admin') return json({error:'Admin access required.'},403);
      const result=await db.prepare('SELECT id,email,role,created_at FROM users ORDER BY id DESC').all();
      return json({users:result.results});
    }
    if (path === '/users' && method === 'POST') {
      if (user?.role !== 'admin') return json({error:'Admin access required.'},403);
      const input=await body(request), email=clean(input.email,200).toLowerCase();
      if (!['partner','mentee'].includes(input.role) || !/^\S+@\S+\.\S+$/.test(email) || String(input.password||'').length<16) return json({error:'Enter a valid email, role and password of at least 16 characters.'},400);
      await db.prepare('INSERT INTO users(email,password_hash,role) VALUES(?,?,?)').bind(email,await hashPassword(input.password),input.role).run();
      return json({ok:true},201);
    }
    if (path === '/prayers' && method === 'GET') {
      if (user?.role !== 'admin') return json({error:'Admin access required.'},403);
      const result=await db.prepare('SELECT id,name,contact,request,created_at FROM prayer_requests ORDER BY id DESC LIMIT 100').all();
      return json({requests:result.results});
    }
    if (path === '/photos' && method === 'GET') {
      const result=await db.prepare('SELECT id,caption,created_at FROM photos ORDER BY created_at DESC LIMIT 100').all();
      return json({photos:result.results});
    }
    if (path === '/photos' && method === 'POST') {
      if (user?.role !== 'admin') return json({error:'Admin access required.'},403);
      if (!env.PHOTOS) return json({error:'Photo storage is not configured.'},503);
      if (Number(request.headers.get('content-length')||0)>5_500_000) return json({error:'Photo too large (5 MB maximum).'},413);
      const data=await request.formData(), file=data.get('photo'), caption=clean(data.get('caption'),200);
      if (!(file instanceof File) || !caption || file.size>5_000_000 || file.size<1 || !['image/jpeg','image/png','image/webp'].includes(file.type)) return json({error:'Choose a JPEG, PNG or WebP image under 5 MB and add a caption.'},400);
      const buffer=await file.arrayBuffer(), head=new Uint8Array(buffer.slice(0,12));
      const valid=file.type==='image/jpeg' ? head[0]===255&&head[1]===216&&head[2]===255 : file.type==='image/png' ? hex(head.slice(0,8))==='89504e470d0a1a0a' : hex(head.slice(0,4))==='52494646'&&hex(head.slice(8,12))==='57454250';
      if (!valid) return json({error:'Invalid image file.'},400);
      const id=crypto.randomUUID(), key='church/'+id;
      await env.PHOTOS.put(key,buffer,{httpMetadata:{contentType:file.type}});
      await db.prepare('INSERT INTO photos(id,caption,object_key,mime_type) VALUES(?,?,?,?)').bind(id,caption,key,file.type).run();
      return json({ok:true,id},201);
    }
    if (path.startsWith('/photo/') && method === 'GET') {
      const photo=await db.prepare('SELECT object_key,mime_type FROM photos WHERE id=?').bind(path.slice(7)).first();
      if (!photo || !env.PHOTOS) return json({error:'Photo not found.'},404);
      const object=await env.PHOTOS.get(photo.object_key);
      return object ? new Response(object.body,{headers:{'content-type':photo.mime_type,'cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}}) : json({error:'Photo not found.'},404);
    }
    if (path === '/messages' && method === 'GET') {
      const result=await db.prepare('SELECT id,title,event_name,event_date,speaker,byte_size FROM audio_messages ORDER BY event_date DESC, created_at DESC LIMIT 100').all();
      return json({messages:result.results});
    }
    if (path === '/messages' && method === 'POST') {
      if (user?.role !== 'admin') return json({error:'Admin access required.'},403);
      if (!env.AUDIO) return json({error:'Audio storage is not configured.'},503);
      if (Number(request.headers.get('content-length')||0)>42_000_000) return json({error:'Audio file exceeds the 40 MB limit.'},413);
      const data=await request.formData(), file=data.get('audio');
      const title=clean(data.get('title'),160), event=clean(data.get('event_name'),160), date=clean(data.get('event_date'),10), speaker=clean(data.get('speaker'),120);
      if (!(file instanceof File) || !title || !event || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || file.size<1 || file.size>40_000_000 || !['audio/mpeg','audio/mp3','application/octet-stream'].includes(file.type) || !/\.mp3$/i.test(file.name)) return json({error:'Enter a title, event and valid date, then choose an MP3 under 40 MB.'},400);
      const buffer=await file.arrayBuffer(), head=new Uint8Array(buffer.slice(0,4));
      if (!(hex(head.slice(0,3))==='494433' || head[0]===255&&(head[1]&224)===224)) return json({error:'The file is not a valid MP3.'},400);
      const id=crypto.randomUUID(), key='messages/'+id+'.mp3';
      await env.AUDIO.put(key,buffer,{httpMetadata:{contentType:'audio/mpeg'}});
      await db.prepare('INSERT INTO audio_messages(id,title,event_name,event_date,speaker,object_key,byte_size) VALUES(?,?,?,?,?,?,?)').bind(id,title,event,date,speaker,key,file.size).run();
      return json({ok:true,id},201);
    }
    if (path.startsWith('/message/') && method === 'GET') {
      const id=path.slice(9), row=await db.prepare('SELECT object_key FROM audio_messages WHERE id=?').bind(id).first();
      if (!row || !env.AUDIO) return json({error:'Message not found.'},404);
      const object=await env.AUDIO.get(row.object_key);
      if (!object) return json({error:'Message not found.'},404);
      const download=new URL(request.url).searchParams.has('download');
      return new Response(object.body,{headers:{'content-type':'audio/mpeg','content-length':String(object.size),'content-disposition':download?`attachment; filename="message-${id}.mp3"`:`inline; filename="message-${id}.mp3"`,'accept-ranges':'none','x-content-type-options':'nosniff','cache-control':'public, max-age=3600'}});
    }
    return json({error:'Not found.'},404);
  } catch (error) {
    if (/^(Request too large|Unexpected token)/.test(error.message)) return json({error:'Invalid request.'},400);
    if (/UNIQUE constraint failed/.test(error.message)) return json({error:'That email is already registered.'},409);
    console.error(error);
    return json({error:'Request could not be completed.'},500);
  }
}
