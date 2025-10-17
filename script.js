// Fixed v2: stable states and polished transitions.
// State machine: 'loading' -> 'start' -> 'lobby' -> 'playing'
(() => {
  const canvas = document.getElementById('gameCanvas');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const startScreen = document.getElementById('startScreen');
  const lobby = document.getElementById('lobby');
  const hud = document.getElementById('hud');
  const startCharRow = document.getElementById('startCharRow');
  const lobbyCharRow = document.getElementById('lobbyCharRow');
  const startBattle = document.getElementById('startBattle');
  const skipIntro = document.getElementById('skipIntro');
  const spawnBtn = document.getElementById('spawnBtn');
  const waveBtn = document.getElementById('waveBtn');
  const hpEl = document.getElementById('hp');
  const maxHpEl = document.getElementById('maxHp');
  const abilityNameEl = document.getElementById('abilityName');
  const cdEl = document.getElementById('cd');
  const enemyCountEl = document.getElementById('enemyCount');

  // three.js setup
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7faab0);
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.8, 6);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); hemi.position.set(0,50,0); scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(-10,20,10); dir.castShadow = true; scene.add(dir);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({color:0x2d4e3a}));
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
  const controls = new THREE.PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  // state
  let state = 'loading'; // loading | start | lobby | playing
  let selectedChar = 'knight';
  let player = null;
  let enemies = [];
  let bullets = [];
  let running = false;

  // helpers
  const raycaster = new THREE.Raycaster();
  function computeDamage(c){ if(c==='knight') return 20; if(c==='archer') return 18; if(c==='wizard') return 12; if(c==='giant') return 36; return 16; }
  function getMaxHp(c){ switch(c){ case 'knight': return 160; case 'archer': return 90; case 'wizard': return 80; case 'giant': return 260; default: return 100; } }

  function setState(s){
    state = s;
    // manage overlays explicitly
    if(s === 'loading'){
      loadingOverlay.classList.add('active'); startScreen.classList.remove('active'); startScreen.classList.add('hidden'); lobby.classList.add('hidden'); hud.classList.add('hidden');
    } else if(s === 'start'){
      loadingOverlay.classList.remove('active'); loadingOverlay.classList.add('hidden'); startScreen.classList.remove('hidden'); startScreen.classList.add('active'); lobby.classList.add('hidden'); hud.classList.add('hidden');
    } else if(s === 'lobby'){
      startScreen.classList.remove('active'); startScreen.classList.add('hidden'); lobby.classList.remove('hidden'); setTimeout(()=> lobby.classList.add('active'), 20); hud.classList.add('hidden');
    } else if(s === 'playing'){
      lobby.classList.remove('active'); setTimeout(()=> lobby.classList.add('hidden'), 420); hud.classList.remove('hidden'); running = true;
    }
  }

  // attach UI interactions after DOM ready
  function setupUI(){
    // start screen selection
    startCharRow.querySelectorAll('.charBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        startCharRow.querySelectorAll('.charBtn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); selectedChar = btn.dataset.char;
      });
    });
    // lobby selection
    lobbyCharRow.querySelectorAll('.charBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        lobbyCharRow.querySelectorAll('.charBtn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); selectedChar = btn.dataset.char;
      });
    });

    // start -> lobby transition (don't auto-hide lobby)
    startBattle.addEventListener('click', () => {
      setState('lobby');
    });
    skipIntro.addEventListener('click', () => setState('lobby'));

    // spawn: spawn player and switch to playing
    spawnBtn.addEventListener('click', () => {
      spawnPlayer();
      setState('playing');
      // require user to click canvas to lock pointer (avoid stealing UI clicks)
      flashMessage('Click canvas to lock pointer for FPS controls');
    });

    waveBtn.addEventListener('click', () => spawnEnemyWave(6));

    // canvas click: lock pointer only when playing
    canvas.addEventListener('click', (e) => {
      if(state !== 'playing') return;
      if(document.pointerLockElement !== canvas) controls.lock();
    });

    // pointer lock unlock brings back lobby if playing
    controls.addEventListener('unlock', () => {
      if(state === 'playing') setState('lobby');
    });

    // keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if(e.key === '1') useAbility();
      if(e.key.toLowerCase() === 'r'){
        spawnPlayer();
        setState('playing');
      }
    });

    // mouse shooting (left click) only when pointer locked
    window.addEventListener('mousedown', (e) => {
      if(e.button !== 0) return;
      if(document.pointerLockElement === canvas && state === 'playing'){
        shoot();
      }
    });
  }

  // flash message helper
  function flashMessage(msg){
    const el = document.createElement('div'); el.textContent = msg;
    Object.assign(el.style, {position:'fixed',right:'18px',bottom:'18px',background:'rgba(6,18,28,0.9)',padding:'8px 12px',borderRadius:'8px',color:'#cfe8ff',boxShadow:'0 10px 30px rgba(0,0,0,0.6)'});
    document.body.appendChild(el); setTimeout(()=> el.remove(),1400);
  }

  // spawn player
  function spawnPlayer(){
    if(player){ scene.remove(player.mesh); player = null; }
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 8), new THREE.MeshStandardMaterial({color:0x2ce6b8}));
    mesh.position.set(0, 1.0, 4); mesh.castShadow = true; scene.add(mesh);
    player = {mesh, hp: getMaxHp(selectedChar), maxHp: getMaxHp(selectedChar), abilityCd:0, shieldUntil:0};
    camera.position.set(mesh.position.x, mesh.position.y + 0.9, mesh.position.z + 3.5); camera.lookAt(mesh.position);
    flashMessage('Spawned: ' + selectedChar);
  }

  // shooting
  function shoot(){
    if(!player) return;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(enemies.map(e=>e.mesh), false);
    if(hits.length > 0){
      const hit = hits[0]; const enemy = enemies.find(en => en.mesh === hit.object);
      if(enemy){ const dmg = computeDamage(selectedChar); enemy.hp -= dmg; spawnFloatingText('-'+Math.round(dmg), hit.point); }
    }
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8), new THREE.MeshBasicMaterial({color:0x9fffe0}));
    b.position.copy(origin); b.userData = {dir, speed: 70, ttl: 1.2}; scene.add(b); bullets.push(b);
  }

  // enemies
  function spawnEnemy(pos){
    const geo = new THREE.CapsuleGeometry(0.4, 0.8, 4, 8);
    const mat = new THREE.MeshStandardMaterial({color:0xff6b6b});
    const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos); mesh.castShadow = true; scene.add(mesh);
    const e = {mesh, hp: 40 + Math.random() * 80, vel: new THREE.Vector3(), lastHit: 0};
    enemies.push(e); updateHud();
  }
  function spawnEnemyWave(n=6){ for(let i=0;i<n;i++){ const x = (Math.random()-0.5)*24; const z = -6 - Math.random()*28; spawnEnemy(new THREE.Vector3(x, 0.8, z)); } flashMessage('Enemy wave: ' + n); }

  // floating texts
  let floating = [];
  function spawnFloatingText(text, pos){
    const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff'; ctx.font='36px sans-serif'; ctx.textAlign='center'; ctx.fillText(text, canvas.width/2, canvas.height/2+12);
    const tex = new THREE.CanvasTexture(canvas); const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex}));
    sp.scale.set(2,1,1); sp.position.copy(pos).add(new THREE.Vector3(0,1.6,0)); scene.add(sp); floating.push({sp, ttl:1.6});
  }

  function damagePlayer(amount){
    if(!player) return; const now = performance.now(); if(player.shieldUntil && now < player.shieldUntil) amount *= 0.45; player.hp -= amount;
    if(player.hp <= 0){ player.hp = 0; updateHud(); flashMessage('You died — returning to lobby'); setTimeout(()=>{ if(player && player.mesh) scene.remove(player.mesh); player=null; setState('lobby'); }, 800); } else updateHud();
  }

  function updateHud(){
    if(!player){ hpEl.textContent='0'; maxHpEl.textContent='0'; } else { hpEl.textContent=Math.round(player.hp); maxHpEl.textContent=Math.round(player.maxHp); }
    abilityNameEl.textContent = abilityNameFor(selectedChar); cdEl.textContent = player ? Math.ceil(player.abilityCd) : '0'; enemyCountEl.textContent = enemies.length;
    if(player) hud.classList.remove('hidden'); else hud.classList.add('hidden');
  }
  function abilityNameFor(c){ switch(c){ case 'knight': return 'Shield'; case 'archer': return 'Volley'; case 'wizard': return 'Fireball'; case 'giant': return 'Slam'; default: return '-'; } }

  let lastShot = 0;
  // main loop
  const clock = new THREE.Clock();
  function animate(){
    const dt = Math.min(clock.getDelta(), 0.05);
    for(let i=bullets.length-1;i>=0;i--){ const b = bullets[i]; b.position.addScaledVector(b.userData.dir, b.userData.speed * dt); b.userData.ttl -= dt; if(b.userData.ttl <= 0){ scene.remove(b); bullets.splice(i,1); } }
    for(let i=enemies.length-1;i>=0;i--){ const e = enemies[i]; if(!e.mesh) continue; const targetPos = player ? player.mesh.position.clone() : new THREE.Vector3(0,0,0); const dir = targetPos.clone().sub(e.mesh.position); dir.y=0; const dist = dir.length(); if(dist>0.001) dir.normalize(); e.mesh.position.addScaledVector(dir, Math.min(1.2, Math.max(0.4, dist*0.2)) * dt); if(player && e.mesh.position.distanceTo(player.mesh.position) < 1.8){ if(!e.lastHit || performance.now() - e.lastHit > 900){ damagePlayer(6 + Math.random()*6); e.lastHit = performance.now(); } } if(e.hp <= 0){ scene.remove(e.mesh); enemies.splice(i,1); flashMessage('Enemy defeated'); } }
    for(let i=floating.length-1;i>=0;i--){ floating[i].ttl -= dt; floating[i].sp.position.y += dt*0.6; if(floating[i].ttl <= 0){ scene.remove(floating[i].sp); floating.splice(i,1); } }
    if(player && player.abilityCd > 0){ player.abilityCd -= dt; if(player.abilityCd < 0) player.abilityCd = 0; }
    updateHud(); renderer.render(scene, camera); requestAnimationFrame(animate);
  }

  function useAbility(){ if(!player) return; if(player.abilityCd > 0) return; player.abilityCd = 8; const origin = camera.position.clone(); if(selectedChar === 'knight'){ player.shieldUntil = performance.now() + 3500; flashMessage('Shield!'); } else if(selectedChar === 'archer'){ for(let i=0;i<5;i++){ const spread = (i-2)*0.06; const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize(); dir.applyAxisAngle(new THREE.Vector3(0,1,0), spread); raycaster.set(origin, dir); const hits = raycaster.intersectObjects(enemies.map(e=>e.mesh), false); if(hits[0]){ const en = enemies.find(x=>x.mesh===hits[0].object); if(en){ en.hp -= 14; spawnFloatingText('-14', hits[0].point); } } } flashMessage('Volley!'); } else if(selectedChar === 'wizard'){ const center = origin.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(6)); enemies.forEach(e=>{ if(e.mesh.position.distanceTo(center) < 3.2){ e.hp -= 40; spawnFloatingText('-40', e.mesh.position); } }); flashMessage('Fireball!'); } else if(selectedChar === 'giant'){ const center = origin.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(4)); enemies.forEach(e=>{ const d = e.mesh.position.distanceTo(center); if(d < 4.5){ e.hp -= 30; spawnFloatingText('-30', e.mesh.position); const push = e.mesh.position.clone().sub(center).normalize().multiplyScalar((4.5-d)*1.2); e.mesh.position.add(push); } }); flashMessage('Ground Slam!'); } }

  // initialisation: simulate asset loading and then show start screen
  function init(){ setupUI(); // simulate quick asset prep, keep loading overlay visible for a short, guaranteed time to avoid flicker
    setTimeout(()=>{ setState('start'); }, 650); // ensure loading visible briefly
    animate(); }
  // expose spawn for console debugging
  window._game = { spawnEnemyWave, spawnPlayer, spawnEnemy };

  window.addEventListener('DOMContentLoaded', init);
  window.addEventListener('resize', ()=>{ camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
})();
