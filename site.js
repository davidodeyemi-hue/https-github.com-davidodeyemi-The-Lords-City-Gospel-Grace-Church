const $=id=>document.getElementById(id);
async function api(path,options={}){const response=await fetch('/api'+path,{credentials:'same-origin',...options});let data;try{data=await response.json()}catch{data={error:'Service unavailable.'}}if(!response.ok)throw Error(data.error||'Request failed.');return data}
function status(id,message,error=false){const el=$(id);if(el){el.textContent=message;el.classList.toggle('error',error)}}
function article(item){const wrapper=document.createElement('article');wrapper.className='list-item';const h=document.createElement('h3');h.textContent=item.title;wrapper.append(h);const date=document.createElement('small');date.textContent=new Date(item.published_at).toLocaleDateString('en-NG',{dateStyle:'medium'});wrapper.append(date);const p=document.createElement('p');p.textContent=item.body;wrapper.append(p);return wrapper}
async function listing(section,target,notice){try{const {items}=await api('/content?section='+encodeURIComponent(section));$(target).replaceChildren(...items.map(article));if(!items.length)status(notice,'No updates have been posted yet.');else status(notice,'')}catch(e){status(notice,e.message,true)}}
async function login(form,notice){const v=Object.fromEntries(new FormData(form));try{await api('/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(v)});location.reload()}catch(e){status(notice,e.message,true)}}
async function gate(role,content,notice){try{const {user}=await api('/me');if(user&&(user.role===role||user.role==='admin')){$(content).classList.remove('hidden');$('login-panel')?.classList.add('hidden');return true}status(notice,'Sign in with your '+role+' account to view this page.');return false}catch(e){status(notice,e.message,true);return false}}
document.addEventListener('submit',async event=>{const form=event.target;if(!form.matches('[data-login]'))return;event.preventDefault();await login(form,form.dataset.notice)});
document.addEventListener('click',async event=>{if(event.target.matches('[data-logout]')){await api('/logout',{method:'POST'});location.href='/'}});

(()=>{
  const body=document.body;
  if(!body)return;

  body.dataset.page=location.pathname.replace(/^\/|\/$/g,'')||'home';
  requestAnimationFrame(()=>body.classList.add('page-ready'));

  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotionPreference=()=>document.documentElement.classList.toggle('has-motion',!reducedMotion.matches);
  syncMotionPreference();
  reducedMotion.addEventListener?.('change',syncMotionPreference);

  const progress=document.createElement('div');
  progress.className='site-progress';
  progress.setAttribute('aria-hidden','true');
  body.prepend(progress);

  const header=document.querySelector('.site-header');
  const menuButton=document.querySelector('.site-menu-button');
  const navigation=document.getElementById('ministry-nav');

  if(header&&menuButton&&navigation){
    if(!header.querySelector('.header-motto')){
      const motto=document.createElement('div');
      motto.className='header-motto';
      const phrase=document.createElement('span');
      phrase.textContent='Raised to raise destinies';
      const social=document.createElement('a');
      social.href='https://www.facebook.com/p/Lords-City-TV-100080231443467/';
      social.target='_blank';
      social.rel='noopener noreferrer';
      social.textContent="Lord's City TV ↗";
      motto.append(phrase,social);
      menuButton.before(motto);
    }

    const syncMenu=()=>{
      const open=menuButton.getAttribute('aria-expanded')==='true';
      body.classList.toggle('nav-open',open);
      if(open)requestAnimationFrame(()=>navigation.querySelector('a')?.focus());
    };
    menuButton.addEventListener('click',syncMenu);
    navigation.addEventListener('click',event=>{if(event.target.closest('a'))body.classList.remove('nav-open')});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')body.classList.remove('nav-open')});
  }

  let scrollTick=false;
  const syncScroll=()=>{
    const distance=document.documentElement.scrollHeight-innerHeight;
    const percentage=distance>0?Math.min(100,Math.max(0,scrollY/distance*100)):0;
    progress.style.width=percentage+'%';
    header?.classList.toggle('is-compact',scrollY>32);
    scrollTick=false;
  };
  addEventListener('scroll',()=>{
    if(!scrollTick){scrollTick=true;requestAnimationFrame(syncScroll)}
  },{passive:true});
  addEventListener('resize',syncScroll,{passive:true});
  syncScroll();

  const serviceGrid=document.querySelector('.service-grid');
  const servicePanels=serviceGrid?[...serviceGrid.querySelectorAll('.service')]:[];
  const panelMode=window.matchMedia('(min-width: 821px)');
  if(servicePanels.length){
    const activate=panel=>{
      if(!panelMode.matches)return;
      servicePanels.forEach(item=>{
        const active=item===panel;
        item.classList.toggle('is-active',active);
        item.setAttribute('aria-expanded',String(active));
      });
    };
    const syncPanels=()=>{
      if(panelMode.matches){
        servicePanels.forEach(item=>{item.tabIndex=0;item.setAttribute('role','button')});
        activate(servicePanels.find(item=>item.classList.contains('is-active'))||servicePanels[0]);
      }else{
        servicePanels.forEach(item=>{
          item.classList.remove('is-active');item.removeAttribute('aria-expanded');item.removeAttribute('role');item.removeAttribute('tabindex');
        });
      }
    };
    servicePanels.forEach((panel,index)=>{
      panel.addEventListener('pointerenter',()=>activate(panel));
      panel.addEventListener('focus',()=>activate(panel));
      panel.addEventListener('click',()=>activate(panel));
      panel.addEventListener('keydown',event=>{
        if(!panelMode.matches)return;
        if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(panel)}
        if(event.key==='ArrowRight'||event.key==='ArrowDown'){
          event.preventDefault();const next=servicePanels[(index+1)%servicePanels.length];activate(next);next.focus();
        }
        if(event.key==='ArrowLeft'||event.key==='ArrowUp'){
          event.preventDefault();const previous=servicePanels[(index-1+servicePanels.length)%servicePanels.length];activate(previous);previous.focus();
        }
      });
    });
    syncPanels();
    panelMode.addEventListener?.('change',syncPanels);
  }

  const hero=document.querySelector('body:not(.interior-page) .hero');
  if(hero&&!reducedMotion.matches){
    hero.addEventListener('pointermove',event=>{
      const bounds=hero.getBoundingClientRect();
      hero.style.setProperty('--pointer-x',((event.clientX-bounds.left)/bounds.width-.5).toFixed(3));
      hero.style.setProperty('--pointer-y',((event.clientY-bounds.top)/bounds.height-.5).toFixed(3));
    });
    hero.addEventListener('pointerleave',()=>{
      hero.style.setProperty('--pointer-x','0');
      hero.style.setProperty('--pointer-y','0');
    });
  }

  const revealTargets=[...document.querySelectorAll([
    'main .section-head','main .about-image','main .about-copy','main .leadership-grid',
    'main .path-grid','main .media-grid','main .visit-grid','main .word-panel',
    'main .giving-intro','main .bank-card','main .partner-welcome','main .signup-intro',
    'main .photo-grid figure','main.wrap > .card','main.wrap > .grid'
  ].join(','))].filter(element=>!element.classList.contains('hidden'));
  revealTargets.forEach((element,index)=>{
    element.classList.add('reveal');
    if(index%3===1)element.classList.add('reveal-left');
    if(index%3===2)element.classList.add('reveal-right');
  });
  if(reducedMotion.matches||!('IntersectionObserver'in window)){
    revealTargets.forEach(element=>element.classList.add('is-visible'));
  }else{
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}
      });
    },{rootMargin:'0px 0px -8% 0px',threshold:.08});
    revealTargets.forEach(element=>observer.observe(element));
  }
})();
