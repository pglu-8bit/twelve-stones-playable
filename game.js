(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('board'), NS = 'http://www.w3.org/2000/svg';
  var vbW = 460, vbH = 390, rings, ys, cx, cy;
  // Board is sized from the free screen area: tall on phones, wide on desktops, so it fills the space.
  function geom() { var A = vbW / 2 - 36, B = vbH / 2 - 36; rings = [A, A * 0.72, A * 0.44]; ys = [B, B * 0.7, B * 0.4]; cx = vbW / 2; cy = vbH / 2; }
  geom();
  var dx = [-1,0,1,1,1,0,-1,-1], dy = [-1,-1,-1,0,1,1,1,0];
  function px(p) { return cx + dx[p % 8] * rings[Math.floor(p / 8)]; }
  function py(p) { return cy + dy[p % 8] * ys[Math.floor(p / 8)]; }
  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }
  var adj = [], mills = [];
  for (var p = 0; p < 24; p++) {
    var r = Math.floor(p / 8), k = p % 8;
    adj[p] = [r * 8 + (k + 1) % 8, r * 8 + (k + 7) % 8];
    if (r) adj[p].push((r - 1) * 8 + k);
    if (r < 2) adj[p].push((r + 1) * 8 + k);
  }
  for (var rr = 0; rr < 3; rr++) for (var s = 0; s < 8; s += 2)
    mills.push([rr * 8 + s, rr * 8 + (s + 1) % 8, rr * 8 + (s + 2) % 8]);
  for (var kk = 0; kk < 8; kk++) mills.push([kk, 8 + kk, 16 + kk]);

  var board = Array(24).fill(0), hand = [0,12,12], side = 1, me = 1;
  var selected = -1, captureRemaining = 0, ended = false, busy = false, paused = false;
  var wins = 0, level = 1, total = 0, computerTimer = null;
  var yt = window.ytgame, inYT = !!(yt && yt.IN_PLAYABLES_ENV); // only obey the YouTube audio setting when really running inside YouTube
  var posCount = {}, quiet = 0, captureHappened = false, note = '', hitEls = [];
  var gStones, gHints, gFx, stoneEls = {}, lastMove = null, pendingLevel = null;

  // Five difficulties, 20 levels each (levels 1-100 overall).
  var TIERS = ['Beginner', 'Novice', 'Skilled', 'Master', 'Maharaja'], PER = 20;
  function tierOf(l) { return Math.floor((l - 1) / PER); }

  function makeBoard() {
    geom(); stoneEls = {}; hitEls = [];
    svg.setAttribute('viewBox', '0 0 ' + vbW + ' ' + vbH);
    svg.innerHTML = '<defs><radialGradient id="gP"><stop stop-color="#fff"/><stop offset="1" stop-color="#e3d6b8"/></radialGradient><radialGradient id="gC"><stop stop-color="#ff8a5c"/><stop offset="1" stop-color="#6b0a05"/></radialGradient>'
      + '<linearGradient id="gB" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#11818b"/><stop offset="1" stop-color="#05303a"/></linearGradient>'
      + '<radialGradient id="gG" cx="50%" cy="50%" r="65%"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></radialGradient></defs>';
    // Board panel fills the whole area so the board looks as big as possible.
    el('rect',{x:4,y:4,width:vbW-8,height:vbH-8,rx:24,fill:'url(#gB)',stroke:'#d49a32','stroke-width':3},svg);
    el('rect',{x:4,y:4,width:vbW-8,height:vbH-8,rx:24,fill:'url(#gG)'},svg);
    el('rect',{x:13,y:13,width:vbW-26,height:vbH-26,rx:17,fill:'none',stroke:'#ffc83d','stroke-opacity':0.35,'stroke-width':1.5,'stroke-dasharray':'2 6','stroke-linecap':'round'},svg);
    var lines = el('g',{id:'lines',stroke:'#ffb627','stroke-width':3,fill:'none','stroke-linecap':'round'},svg);
    for (var i=0;i<3;i++) el('rect',{x:cx-rings[i],y:cy-ys[i],width:rings[i]*2,height:ys[i]*2,rx:4},lines);
    for (i=0;i<8;i++) el('line',{x1:px(i),y1:py(i),x2:px(16+i),y2:py(16+i)},lines);
    var dots=el('g',{},svg), hits=el('g',{},svg);
    for(i=0;i<24;i++) {
      el('circle',{cx:px(i),cy:py(i),r:11,fill:'#052f38',stroke:'#ffc83d','stroke-width':2},dots);
      el('circle',{cx:px(i),cy:py(i),r:4,fill:'#ff7a18'},dots);
      (function(idx){var h=el('circle',{cx:px(idx),cy:py(idx),r:25,fill:'transparent',tabindex:idx===9?0:-1,role:'button','aria-label':'Board point '+(idx+1)},hits);
        h.addEventListener('click',function(){onPoint(idx);});
        hitEls[idx]=h;
        h.addEventListener('keydown',function(e){
          if(e.key==='Enter'||e.key===' '){e.preventDefault();onPoint(idx);return;}
          var v={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[e.key];
          if(!v)return;e.preventDefault();
          var best=-1,bc=1e9;
          for(var q=0;q<24;q++){if(q===idx)continue;var ddx=px(q)-px(idx),ddy=py(q)-py(idx),along=ddx*v[0]+ddy*v[1],perp=Math.abs(ddx*v[1]-ddy*v[0]);
            if(along<=0)continue;var cost=along+2*perp;if(cost<bc){bc=cost;best=q;}}
          if(best>=0){hitEls.forEach(function(n){n.setAttribute('tabindex','-1');});hitEls[best].setAttribute('tabindex','0');hitEls[best].focus();}
        });
      })(i);
    }
    gStones=el('g',{id:'stones','pointer-events':'none'},svg);
    gHints=el('g',{id:'hints','pointer-events':'none'},svg);
    gFx=el('g',{id:'fx','pointer-events':'none'},svg);
  }
  // Re-shape the board to the free space (phone portrait = tall board, desktop = wide board).
  function fit() {
    var wrap = svg.parentNode, w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    var nh = Math.round(Math.max(390, Math.min(vbW * 1.15, vbW * h / w)));
    if (Math.abs(nh - vbH) < 6) return;
    vbH = nh; makeBoard(); render();
  }
  function isMill(b,p,who) { return mills.some(function(m){return m.indexOf(p)>=0&&m.every(function(q){return b[q]===who;});}); }
  function completedMills(b,p,who) { return mills.filter(function(m){return m.indexOf(p)>=0&&m.every(function(q){return b[q]===who;});}); }
  function newlyMadeMills(before,p,who) {
    return completedMills(board,p,who).filter(function(m){return !m.every(function(q){return before[q]===who;});}).length;
  }
  function totalPieces(who) { return hand[who]+board.filter(function(x){return x===who;}).length; }
  // Stones inside a Tigadi are protected. If ALL of a player's stones are in Tigadis,
  // this list is empty and the Tigadi captures nothing.
  function targets(who) {
    var safe=[];
    board.forEach(function(x,p){if(x===who&&!isMill(board,p,who))safe.push(p);});
    return safe;
  }
  function moves(who) {
    var out=[];
    if(hand[who]>0) board.forEach(function(x,p){if(!x)out.push({from:-1,to:p});});
    else board.forEach(function(x,p){if(x===who)adj[p].forEach(function(q){if(!board[q])out.push({from:p,to:q});});});
    return out;
  }
  function newMillList(before,p,who) {
    return completedMills(board,p,who).filter(function(m){return !m.every(function(q){return before[q]===who;});});
  }
  function render() {
    var now=Date.now();
    for (var p=0;p<24;p++) {
      var who=board[p], cur=stoneEls[p];
      if (cur && cur.who!==who) { cur.g.remove(); delete stoneEls[p]; cur=null; }
      if (who && !cur) {
        var g=el('g',{transform:'translate('+px(p)+','+py(p)+')',class:who===1?'peb ivory':'peb sindoor'},gStones);
        var inn=el('g',{class:'in'},g);
        el('ellipse',{cx:0,cy:4,rx:20,ry:18,class:'shadow'},inn);
        el('circle',{r:21,fill:who===1?'url(#gP)':'url(#gC)',stroke:'#ffc83d','stroke-width':2},inn);
        el('circle',{r:3,fill:who===1?'#c8321f':'#ffe9a8'},inn);
        el('ellipse',{cx:-7,cy:-8,rx:7,ry:4,class:'shine'},inn);
        el('circle',{r:25,class:'rim'},inn);
        if (lastMove && lastMove.to===p && now-lastMove.t<700) {
          if (lastMove.from>=0) {
            inn.setAttribute('class','in slide');
            inn.style.setProperty('--fx',(px(lastMove.from)-px(p))+'px');
            inn.style.setProperty('--fy',(py(lastMove.from)-py(p))+'px');
          } else inn.setAttribute('class','in drop');
          ripple(p);
        }
        stoneEls[p]={g:g,who:who}; cur=stoneEls[p];
      }
      if (cur) cur.g.classList.toggle('mill',isMill(board,p,who));
    }
    var h=gHints; h.textContent='';
    if(captureRemaining) {
      targets(3-me).forEach(function(p){el('circle',{cx:px(p),cy:py(p),r:27,class:'ring danger pulse'},h);});
    } else if(!ended&&!busy&&side===me&&!hand[me]) {
      board.forEach(function(who,from){
        if(who!==me)return;
        var destinations=adj[from].filter(function(to){return !board[to];});
        if(!destinations.length)return;
        if(selected===from) el('circle',{cx:px(from),cy:py(from),r:27,class:'ring pulse'},h);
        else el('circle',{cx:px(from),cy:py(from),r:23,fill:'none',stroke:'rgba(255,209,102,0.65)','stroke-width':2},h);
        destinations.forEach(function(to){el('circle',{cx:px(to),cy:py(to),r:selected===from?11:7,class:selected===from?'dest':'dest dim'},h);});
      });
    } else if(selected>=0) el('circle',{cx:px(selected),cy:py(selected),r:27,class:'ring pulse'},h);
    updateUI();
  }

  // ---- Effects ----
  function buzz(pattern){try{if(hapticsOn&&!paused&&navigator.vibrate)navigator.vibrate(pattern);}catch(e){}}
  function later(node,ms){setTimeout(function(){if(node.parentNode)node.parentNode.removeChild(node);},ms);}
  function ripple(p){later(el('circle',{cx:px(p),cy:py(p),r:20,class:'fx'},gFx),750);}
  function removeStone(p,victim){fxCapture(p,victim);board[p]=0;}
  function fxCapture(p,victim){
    var x=px(p),y=py(p);
    var g=el('g',{transform:'translate('+x+','+y+')',class:'peb ghost '+(victim===1?'ivory':'sindoor')},gFx);
    var inn=el('g',{class:'in'},g);
    el('circle',{r:21,fill:victim===1?'url(#gP)':'url(#gC)',stroke:'#ffc83d','stroke-width':2},inn);
    later(g,700);
    later(el('circle',{cx:x,cy:y,r:20,class:'fx d2'},gFx),800);
    for(var i=0;i<10;i++){
      var a=i*Math.PI/5,d=34+Math.random()*26;
      var s=el('circle',{cx:x,cy:y,r:3,class:'spark'},gFx);
      s.style.setProperty('--dx',Math.cos(a)*d+'px');s.style.setProperty('--dy',Math.sin(a)*d+'px');
      later(s,800);
    }
  }
  function banner(text){var n=document.createElement('div');n.className='banner';n.setAttribute('aria-hidden','true');n.textContent=text;document.body.appendChild(n);later(n,1500);}
  function confetti(n){
    var cols=['#ff8c1a','#ffd23f','#d7263d','#2ea44f','#ff8fb8','#fff0b3'];
    for(var i=0;i<n;i++){var c=document.createElement('div');c.className='conf';
      c.style.left=Math.random()*100+'%';c.style.background=cols[i%cols.length];c.style.width=(6+Math.random()*6)+'px';
      c.style.animationDuration=(1.6+Math.random()*1.4)+'s';c.style.animationDelay=(Math.random()*0.4)+'s';
      document.body.appendChild(c);later(c,3600);}
  }
  function playChime(){[523,659,784].forEach(function(f,i){setTimeout(function(){playTone(f,0.18);},i*90);});}
  // Called whenever a Tigadi is completed (by either side).
  function celebrate(who,to,before){
    var list=newMillList(before,to,who);if(!list.length)return;
    list.forEach(function(m){later(el('path',{d:'M'+px(m[0])+' '+py(m[0])+'L'+px(m[2])+' '+py(m[2]),pathLength:1,class:'mflash'},gFx),1500);});
    banner(who===me?'Tigadi!  तिगड़ी':'Computer: Tigadi!');
    playChime();buzz(who===me?[30,40,60]:[60]);
    if(who===me)confetti(26);
  }
  // Glowing mandala and floating sparks behind the game.
  function backdrop(){
    var m=$('mandalaBg');
    if(m&&!m.firstChild){
      var s='<svg viewBox="-100 -100 200 200" width="100%" height="100%" fill="none" stroke="#ffc83d" stroke-width="0.8">';
      for(var i=0;i<16;i++)s+='<path transform="rotate('+(i*22.5)+')" d="M0 -96 C13 -74 13 -54 0 -34 C-13 -54 -13 -74 0 -96Z"/>';
      for(i=0;i<12;i++)s+='<path transform="rotate('+(i*30)+')" d="M0 -30 C8 -22 8 -12 0 -4 C-8 -12 -8 -22 0 -30Z"/>';
      s+='<circle r="98"/><circle r="34"/><circle r="3"/></svg>';m.innerHTML=s;
    }
    var sp=$('sparks');
    if(sp&&!sp.firstChild){for(var k=0;k<22;k++){var d=document.createElement('span');d.className='sp';
      var sz=2+Math.random()*4;d.style.left=Math.random()*100+'%';d.style.width=d.style.height=sz+'px';
      d.style.animationDuration=(7+Math.random()*9)+'s';d.style.animationDelay=(-Math.random()*14)+'s';sp.appendChild(d);}}
  }
  function say(text){$('status').innerHTML=text;}
  function updateUI(){
    for(var p=1;p<=2;p++){
      var sEl=$('s'+p),val=String(totalPieces(p));
      if(sEl.textContent!==val){var had=sEl.textContent!=='';sEl.textContent=val;if(had){sEl.classList.remove('bump');void sEl.offsetWidth;sEl.classList.add('bump');}}
      $('n'+p).textContent=(p===me?'You':'Computer')+' · '+(p===1?'Ivory':'Sindoor');
      $('h'+p).textContent=hand[p]?hand[p]+' left to place':'all placed';$('card'+p).classList.toggle('turn',!ended&&side===p);
    }
    $('stats').textContent='Wins: '+wins+' · Total score: '+total;
    var t=tierOf(level),lv=level-t*PER,txt=TIERS[t]+' · Level '+lv+' / '+PER;
    $('lvl').textContent=txt;
    var l2=$('lvl2');l2.textContent='★ '+txt;l2.style.setProperty('--p',Math.round(lv/PER*100)+'%');
  }

  // Sound starts ON. Browsers only allow audio after a tap, so music begins on the first tap anywhere.
  var audio=new Audio();audio.loop=true;audio.preload='auto';audio.volume=0.45;
  audio.muted=false;
  audio.src='assets/music.mp3';
  var musicOn=true,sfxOn=true,hapticsOn=true,ytAudio=true; // ytAudio mirrors the YouTube audio setting; it always wins
  function musicAllowed(){return ytAudio&&musicOn;}
  function sfxAllowed(){return ytAudio&&sfxOn;}
  var audioOk=false;
  audio.addEventListener('playing',function(){audioOk=true;});
  audio.addEventListener('pause',function(){audioOk=false;});
  audio.addEventListener('error',function(){audioOk=false;});
  // Retried on every tap until the browser lets the music start.
  function startAudio(){if(!musicAllowed()||paused||audioOk)return;var play=audio.play();if(play&&play.catch)play.catch(function(){audioOk=false;});}
  function startFromGesture(e){startAudio();}
  ['pointerdown','pointerup','click','touchend','keydown'].forEach(function(ev){document.addEventListener(ev,startFromGesture);});
  function stopAudio(){audio.pause();}
  function applyMasterVolume(){var c=getCtx.ctx;if(c&&getCtx.master){var g=getCtx.master.gain;g.cancelScheduledValues(c.currentTime);g.setValueAtTime(sfxAllowed()?1:0,c.currentTime);}}
  // Music, effects and vibration have their own toggles. Nothing plays while the YouTube audio setting is off.
  function setBtn(id,on,label){var b=$(id);if(!b)return;b.setAttribute('aria-pressed',String(on));if(label)b.textContent=label+': '+(on?'On':'Off');}
  function applyAudio(){
    audio.muted=!musicAllowed();applyMasterVolume();
    if(musicAllowed())startAudio();else stopAudio();
    setBtn('musicBtn',musicOn,'\u266B Music');setBtn('sfxBtn',sfxOn,'\u2605 Effects');setBtn('hapBtn',hapticsOn,'\u2733 Vibration');
    var m2=$('mute2');if(m2){m2.setAttribute('aria-pressed',String(musicOn));m2.setAttribute('aria-label','Music '+(musicOn?'on':'off'));m2.title='Music';}
  }
  function getCtx(){
    var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
    var ctx=getCtx.ctx;if(!ctx){ctx=getCtx.ctx=new AC();getCtx.master=ctx.createGain();getCtx.master.gain.value=sfxAllowed()?1:0;getCtx.master.connect(ctx.destination);}
    if(ctx.state==='suspended')ctx.resume();return ctx;
  }
  function playTone(freq,duration){
    if(!sfxAllowed()||paused)return;
    try{var ctx=getCtx();if(!ctx)return;var osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.frequency.value=freq;gain.gain.setValueAtTime(0.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+duration);osc.connect(gain);gain.connect(getCtx.master);osc.start();osc.stop(ctx.currentTime+duration);
    }catch(e){}
  }
  // Applause: a few short bursts of filtered noise.
  function playClap(){
    if(!sfxAllowed()||paused)return;
    try{var ctx=getCtx();if(!ctx)return;
      for(var i=0;i<4;i++){
        var t=ctx.currentTime+i*0.11,len=Math.floor(ctx.sampleRate*0.07),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
        for(var j=0;j<len;j++)d[j]=(Math.random()*2-1)*Math.pow(1-j/len,2);
        var src=ctx.createBufferSource(),bp=ctx.createBiquadFilter(),gain=ctx.createGain();
        src.buffer=buf;bp.type='bandpass';bp.frequency.value=1800+i*150;bp.Q.value=0.8;gain.gain.value=0.9;
        src.connect(bp);bp.connect(gain);gain.connect(getCtx.master);src.start(t);
      }
    }catch(e){}
  }
  function playSad(){playTone(330,0.22);setTimeout(function(){playTone(262,0.35);},200);}

  // NEW: cracker "pop" sound (a short low-passed noise burst), follows the Sound button.
  function playCracker(){
    if(!sfxAllowed()||paused)return;
    try{var ctx=getCtx();if(!ctx)return;
      var len=Math.floor(ctx.sampleRate*0.25),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
      for(var j=0;j<len;j++)d[j]=(Math.random()*2-1)*Math.pow(1-j/len,3);
      var src=ctx.createBufferSource(),lp=ctx.createBiquadFilter(),gain=ctx.createGain();
      src.buffer=buf;lp.type='lowpass';lp.frequency.value=1200+Math.random()*1200;gain.gain.value=0.7;
      src.connect(lp);lp.connect(gain);gain.connect(getCtx.master);src.start();
    }catch(e){}
  }

  // NEW: fireworks / crackers shown when the player wins.
  var fwCanvas=null,fwRaf=0,fwTimers=[];
  function stopFireworks(){
    if(fwRaf)cancelAnimationFrame(fwRaf);fwRaf=0;
    fwTimers.forEach(clearTimeout);fwTimers=[];
    if(fwCanvas){
      try{if(fwCanvas.hidePopover)fwCanvas.hidePopover();}catch(e){}
      if(fwCanvas.parentNode)fwCanvas.parentNode.removeChild(fwCanvas);
      fwCanvas=null;
    }
  }
  function fireworks(){
    stopFireworks();
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var cv=document.createElement('canvas');
    cv.setAttribute('aria-hidden','true');
    var st=cv.style;
    st.position='fixed';st.left='0';st.top='0';st.width='100%';st.height='100%';
    st.border='0';st.padding='0';st.margin='0';st.background='transparent';st.overflow='visible';
    st.pointerEvents='none';st.zIndex='9999';
    // Popover puts the canvas in the top layer, so it shows above the "You win" dialog.
    if('popover' in cv)cv.setAttribute('popover','manual');
    document.body.appendChild(cv);
    try{if(cv.showPopover)cv.showPopover();}catch(e){}
    fwCanvas=cv;
    var dpr=window.devicePixelRatio||1,W=window.innerWidth,H=window.innerHeight;
    cv.width=W*dpr;cv.height=H*dpr;
    var c=cv.getContext('2d');c.scale(dpr,dpr);
    var parts=[],start=performance.now();
    function burst(){
      var x=W*(0.15+Math.random()*0.7),y=H*(0.12+Math.random()*0.4),hue=Math.floor(Math.random()*360);
      for(var i=0;i<70;i++){
        var a=Math.random()*Math.PI*2,sp=1+Math.random()*4.5;
        parts.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:0.012+Math.random()*0.012,
          color:'hsl('+Math.floor((hue+Math.random()*40)%360)+',100%,60%)'});
      }
      playCracker();
    }
    burst();
    for(var b=1;b<10;b++)fwTimers.push(setTimeout(burst,b*350));
    function frame(now){
      c.clearRect(0,0,W,H);
      for(var i=parts.length-1;i>=0;i--){
        var q=parts[i];
        q.vx*=0.985;q.vy=q.vy*0.985+0.04;q.x+=q.vx;q.y+=q.vy;q.life-=q.decay;
        if(q.life<=0){parts.splice(i,1);continue;}
        c.globalAlpha=q.life;c.fillStyle=q.color;
        c.beginPath();c.arc(q.x,q.y,2.2,0,Math.PI*2);c.fill();
      }
      c.globalAlpha=1;
      if(!parts.length&&now-start>3800){stopFireworks();return;}
      fwRaf=requestAnimationFrame(frame);
    }
    fwRaf=requestAnimationFrame(frame);
  }

  function showReaction(emoji){
    var n=document.createElement('div');n.className='reaction';n.setAttribute('aria-hidden','true');n.textContent=emoji;
    document.body.appendChild(n);setTimeout(function(){if(n.parentNode)n.parentNode.removeChild(n);},1300);
  }

  // Computer skill rises with the level: at level 1 it plays mostly at random, at level 100 almost always the best move it can see.
  function smartChance(){return 0.1+0.85*(level-1)/99;}
  function scoreMove(m,who){
    var opp=3-who,b=board.slice();
    if(m.from>=0)b[m.from]=0;
    b[m.to]=who;
    var sc=Math.random()*2;
    mills.forEach(function(ml){
      if(ml.indexOf(m.to)<0)return;
      var mine=0,theirs=0;
      ml.forEach(function(q){if(q===m.to)return;if(board[q]===who&&q!==m.from)mine++;else if(board[q]===opp)theirs++;});
      if(mine===2)sc+=10;               // completes a Tigadi
      else if(theirs===2)sc+=6;         // blocks a rival Tigadi
      else if(mine===1&&theirs===0)sc+=1.5;
    });
    sc+=adj[m.to].filter(function(q){return !b[q];}).length*0.3;
    return sc;
  }
  function pickMove(options,who){
    if(Math.random()>=smartChance())return options[Math.floor(Math.random()*options.length)];
    var best=null,bs=-1e9;
    options.forEach(function(m){var sc=scoreMove(m,who);if(sc>bs){bs=sc;best=m;}});
    return best;
  }
  function pickCapture(choices,who){
    if(Math.random()>=smartChance())return choices[Math.floor(Math.random()*choices.length)];
    var victim=3-who,best=choices[0],bs=-1e9;
    choices.forEach(function(p){
      var sc=Math.random();
      mills.forEach(function(ml){
        if(ml.indexOf(p)<0)return;
        var own=0,enemy=0;
        ml.forEach(function(q){if(board[q]===victim)own++;else if(board[q]===who)enemy++;});
        if(enemy===0)sc+=own*2;
      });
      sc+=adj[p].filter(function(q){return !board[q];}).length*0.5;
      if(sc>bs){bs=sc;best=p;}
    });
    return best;
  }

  function endTurn(who){
    selected=-1;captureRemaining=0;
    var lead=note;note='';
    if(totalPieces(3-who)<=2)return finish(who===me?'win':'lose');
    side=3-who;
    if(!moves(side).length){if(!moves(who).length)return finish('draw');side=who;}
    // Draw rules: 100 turns without a capture, or the same position three times, once all stones are placed.
    if(captureHappened){posCount={};quiet=0;captureHappened=false;}
    else if(!hand[1]&&!hand[2])quiet++;
    if(quiet>=100)return finish('draw');
    if(!hand[1]&&!hand[2]){var key=board.join('')+side;posCount[key]=(posCount[key]||0)+1;if(posCount[key]>=3)return finish('draw');}
    render();
    if(side!==me){busy=true;say(lead+'The computer is thinking…');computerTimer=setTimeout(computerMove,450);}
    else{busy=false;say(lead+(hand[me]?'Your move. Place a stone on any empty point.':'Your move. Choose a stone, then an adjacent empty point.'));}
  }
  function resolveMove(who,from,to,before){
    var made=Math.min(2,newlyMadeMills(before,to,who));
    if(made>0)celebrate(who,to,before);
    if(made>0&&who===me){playClap();showReaction('👏');}
    var eligible=targets(3-who);
    var captures=Math.min(made,eligible.length);
    if(captures>0&&who===me){captureRemaining=captures;say('<strong>Tigadi!</strong> Choose '+(captures===1?'one enemy stone':'two enemy stones')+' to capture.');render();return;}
    if(made>0&&who===me&&captures===0)note='<strong>Tigadi!</strong> All enemy stones are protected, so nothing is captured. ';
    // Computer captures one stone per newly formed Tigadi. Protected stones are never captured.
    var taken=0;
    while(captures>0){var choices=targets(3-who);if(!choices.length)break;removeStone(pickCapture(choices,who),3-who);buzz(40);captures--;taken++;captureHappened=true;playTone(300,0.12);}
    if(taken>0&&who!==me){showReaction('😢');playSad();}
    render();endTurn(who);
  }
  function onPoint(p){
    if(ended||busy||paused||side!==me)return;
    if(captureRemaining>0){
      if(targets(3-me).indexOf(p)<0)return;
      removeStone(p,3-me);captureRemaining--;captureHappened=true;playTone(300,0.12);buzz(25);render();
      if(captureRemaining>0&&targets(3-me).length){say('<strong>Tigadi!</strong> Choose another enemy stone.');return;}
      captureRemaining=0;endTurn(me);return;
    }
    if(hand[me]>0){
      if(board[p])return;
      var before=board.slice();board[p]=me;hand[me]--;lastMove={from:-1,to:p,t:Date.now()};playTone(440,0.08);render();resolveMove(me,-1,p,before);return;
    }
    if(selected<0){if(board[p]===me&&adj[p].some(function(q){return !board[q];})){selected=p;render();}return;}
    if(p===selected){selected=-1;render();return;}
    if(board[p]===me){selected=p;render();return;}
    if(!board[p]&&adj[selected].indexOf(p)>=0){
      var from=selected,before=board.slice();board[from]=0;board[p]=me;selected=-1;lastMove={from:from,to:p,t:Date.now()};playTone(440,0.08);render();resolveMove(me,from,p,before);
    }
  }
  function computerMove(){
    computerTimer=null;
    if(ended||paused||side===me)return;
    var options=moves(side),move=options.length?pickMove(options,side):null;
    if(!move){finish('draw');return;}
    var who=side,before=board.slice();
    if(move.from<0)hand[who]--;else board[move.from]=0;
    board[move.to]=who;lastMove={from:move.from,to:move.to,t:Date.now()};playTone(520,0.12);render();resolveMove(who,move.from,move.to,before);
  }
  function finish(result){
    ended=true;busy=false;selected=-1;captureRemaining=0;
    var text=result==='win'?'Shabash! You win.':result==='lose'?'The computer wins this round.':'A draw.';
    var atTop=level%PER===0,tier=tierOf(level),doneLv=level-tier*PER;pendingLevel=null;
    if(result==='win'){wins++;var score=20*level+50*totalPieces(me);total+=score;if(!atTop)level++;else if(tier<TIERS.length-1)pendingLevel=(tier+1)*PER+1;text+=' Score: '+score+'.';saveProgress();sendBest();}
    render();say('<strong>'+text+'</strong>');if(result!=='draw')playTone(result==='win'?660:220,0.35);
    setTimeout(function(){if(document.body.dataset.screen!=='game')return;$('overTitle').textContent=text;
      var btn=$('overAgain'),ot=$('overText');
      if(result==='win'){
        if(!atTop){ot.textContent='Level '+doneLv+' cleared! Ready for Level '+(doneLv+1)+' of '+TIERS[tier]+'?';btn.textContent='Next Level ▶';}
        else if(pendingLevel){ot.textContent='You cleared every level of '+TIERS[tier]+'! Ready to move up to '+TIERS[tier+1]+'?';btn.textContent='Next: '+TIERS[tier+1]+' ▶';}
        else{ot.textContent='You cleared every level of the game. Shabash, Maharaja!';btn.textContent='Play Again';}
      }else{ot.textContent=result==='lose'?'Do not give up. Try this level again!':'Start another match when you are ready.';btn.textContent=result==='lose'?'Try Again':'Play Again';}
      var d=$('dlgOver');if(d.showModal)d.showModal();else d.setAttribute('open','');
      if(result==='win'&&!paused)fireworks(); // CHANGED: crackers burst on a win (started after the dialog so they show on top)
    },500);
  }
  function newGame(){
    stopFireworks(); // NEW: clear crackers when a new game starts
    if(computerTimer)clearTimeout(computerTimer);
    var d=$('dlgOver');if(d.open&&d.close)d.close();else d.removeAttribute('open');
    board=Array(24).fill(0);hand=[0,12,12];me=parseInt($('first').value,10)||1;side=1;selected=-1;captureRemaining=0;ended=false;busy=false;
    posCount={};quiet=0;captureHappened=false;note='';lastMove=null;
    render();
    if(side!==me){busy=true;say('The computer plays first…');computerTimer=setTimeout(computerMove,600);}
    else say('Your move. Place a stone on any empty point.');
  }
  function openDialog(id){var d=$(id);if(d.showModal)d.showModal();else d.setAttribute('open','');}
  makeBoard();
  function setScreen(name){
    document.body.dataset.screen=name;
    var a=document.querySelector('.app');a.classList.remove('swap');void a.offsetWidth;a.classList.add('swap');
  }
  function startGame(){startAudio();setScreen('game');fit();newGame();}
  function goHome(){
    stopFireworks();if(computerTimer){clearTimeout(computerTimer);computerTimer=null;}
    ['dlgOver','dlgRules'].forEach(function(id){var d=$(id);if(d.open&&d.close)d.close();else d.removeAttribute('open');});
    busy=false;ended=true;updateUI();setScreen('menu');saveProgress();
  }
  $('new').addEventListener('click',startGame);$('restart').addEventListener('click',newGame);$('home').addEventListener('click',goHome);$('overHome').addEventListener('click',goHome);$('mute2').addEventListener('click',function(){musicOn=!musicOn;applyAudio();saveProgress();});$('overAgain').addEventListener('click',function(){
    if(pendingLevel){level=pendingLevel;pendingLevel=null;$('diff').value=String(tierOf(level));}
    newGame();
  });
  $('diff').addEventListener('change',function(){level=parseInt(this.value,10)*PER+1;updateUI();saveProgress();});
  $('overView').addEventListener('click',function(){var d=$('dlgOver');if(d.close)d.close();else d.removeAttribute('open');});
  $('rulesBtn').addEventListener('click',function(){openDialog('dlgRules');});$('rulesBack').addEventListener('click',function(){var d=$('dlgRules');if(d.close)d.close();else d.removeAttribute('open');});
  function setRulesLang(hi){$('rulesHi').hidden=!hi;$('rulesEn').hidden=!!hi;$('langEn').setAttribute('aria-pressed',String(!hi));$('langHi').setAttribute('aria-pressed',String(!!hi));}
  $('langEn').addEventListener('click',function(){setRulesLang(false);});
  $('langHi').addEventListener('click',function(){setRulesLang(true);});
  $('musicBtn').addEventListener('click',function(){musicOn=!musicOn;applyAudio();saveProgress();});
  $('sfxBtn').addEventListener('click',function(){sfxOn=!sfxOn;applyAudio();saveProgress();});
  $('hapBtn').addEventListener('click',function(){hapticsOn=!hapticsOn;applyAudio();saveProgress();if(hapticsOn)buzz(30);});
  ['dlgRules','dlgOver'].forEach(function(id){$(id).addEventListener('click',function(e){if(e.target===this&&this.close)this.close();});});
  // ---------------- YouTube Playables SDK ----------------
  var ytReady=!!(inYT&&yt.game&&yt.system);
  function logYT(kind){try{if(ytReady&&yt.health&&yt.health[kind])yt.health[kind]();}catch(e){}}
  window.addEventListener('error',function(){logYT('logError');});
  window.addEventListener('unhandledrejection',function(){logYT('logWarning');});

  // Cloud save (the only place progress is stored). saveData is never called before loadData has settled.
  var loadSettled=false,lastSaved='';
  function snapshot(){return JSON.stringify({v:1,level:level,wins:wins,total:total,music:musicOn,sfx:sfxOn,haptics:hapticsOn});}
  function saveProgress(){
    if(!ytReady||!loadSettled)return;
    try{var s=snapshot();if(s===lastSaved)return;lastSaved=s;
      Promise.resolve(yt.game.saveData(s)).catch(function(){lastSaved='';logYT('logWarning');});
    }catch(e){lastSaved='';logYT('logWarning');}
  }
  function sendBest(){
    if(!ytReady||!yt.engagement||!yt.engagement.sendScore)return;
    try{Promise.resolve(yt.engagement.sendScore({value:Math.max(0,Math.floor(total))})).catch(function(){logYT('logWarning');});}catch(e){}
  }
  function intIn(v,lo,hi,d){v=Math.floor(Number(v));return isFinite(v)&&v>=lo&&v<=hi?v:d;}
  function applySaved(str){ // tolerant of empty, damaged or older saves
    if(!str)return;var o;try{o=JSON.parse(str);}catch(e){return;}
    if(!o||typeof o!=='object')return;
    level=intIn(o.level,1,PER*TIERS.length,1);wins=intIn(o.wins,0,1e9,0);total=intIn(o.total,0,Number.MAX_SAFE_INTEGER,0);
    if(typeof o.music==='boolean')musicOn=o.music;if(typeof o.sfx==='boolean')sfxOn=o.sfx;if(typeof o.haptics==='boolean')hapticsOn=o.haptics;
    $('diff').value=String(tierOf(level));
  }
  function withTimeout(p,ms){return Promise.race([Promise.resolve(p),new Promise(function(res){setTimeout(res,ms);})]);}

  // Pause and resume come only from the SDK (no Page Visibility API). Everything stops while paused.
  var resumeComputer=false;
  function pauseGame(){
    if(paused)return;paused=true;document.body.classList.add('isPaused');
    if(computerTimer){clearTimeout(computerTimer);computerTimer=null;resumeComputer=true;}
    stopAudio();stopFireworks();
    try{if(getCtx.ctx&&getCtx.ctx.suspend)getCtx.ctx.suspend();}catch(e){}
    saveProgress();
  }
  function resumeGame(){
    if(!paused)return;paused=false;document.body.classList.remove('isPaused');
    try{if(getCtx.ctx&&getCtx.ctx.resume)getCtx.ctx.resume();}catch(e){}
    if(document.body.dataset.screen==='game'&&!ended&&side!==me&&(resumeComputer||busy)&&!computerTimer){computerTimer=setTimeout(computerMove,300);}
    resumeComputer=false;applyAudio();
  }
  if(ytReady){try{
    yt.system.onPause(pauseGame);yt.system.onResume(resumeGame);
    yt.system.onAudioEnabledChange(function(on){ytAudio=!!on;applyAudio();});
  }catch(e){}}
  try{if(ytReady&&yt.system.isAudioEnabled)ytAudio=!!yt.system.isAudioEnabled();}catch(e){}
  if(window.ResizeObserver)new ResizeObserver(fit).observe(svg.parentNode);window.addEventListener('resize',fit);
  backdrop();
  render(); // first screen is the menu; the game starts when New Game is pressed
  applyAudio(); // music starts at the first tap, as browsers require

  // Loading: the splash is already on screen, so tell YouTube the first frame is up, load the save,
  // then remove the splash and report the game ready (menu is now interactive).
  function afterPaint(fn){requestAnimationFrame(function(){requestAnimationFrame(fn);});}
  afterPaint(function(){
    try{if(ytReady)yt.game.firstFrameReady();}catch(e){}
    var work=[];
    if(ytReady){
      work.push(Promise.resolve().then(function(){return yt.game.loadData();}).then(applySaved,function(){}).then(function(){loadSettled=true;}));
      work.push(Promise.resolve().then(function(){return yt.system.getLanguage();}).then(function(l){if(/^hi\b/i.test(String(l||'')))setRulesLang(true);},function(){}));
    }
    withTimeout(Promise.all(work),4000).then(function(){
      loadSettled=true; // a very slow load must not block future saves
      applyAudio();updateUI();
      var sp=$('splash');if(sp&&sp.parentNode)sp.parentNode.removeChild(sp);
      afterPaint(function(){try{if(ytReady)yt.game.gameReady();}catch(e){}});
    });
  });
})();
