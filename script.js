// Improved FPS prototype - script.js
// Cleared up spawn issues, more stable enemy AI, clear shooting, UI updates and animations.
// Keep this single-file secondary script loaded by index.html.

(() => {
  // --- Basic scene setup ---
  const canvas = document.getElementById('gameCanvas');
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x98a8b8);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0,1.6,2);

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
  hemi.position.set(0, 50, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(-10, 20, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024,1024);
  dir.shadow.camera.left = -30; dir.shadow.camera.right = 30; dir.shadow.camera.top = 30; dir.shadow.camera.bottom = -30;
  scene.add(dir);

  // ground
  const floorMat = new THREE.MeshStandardMaterial({color:0x2d4e3a});
  const floorGeo = new THREE.PlaneGeometry(200,200);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);

  // arena obstacles (non-overlapping, static)
  const obstacles = [];
  function addBox(x,y,z,w,h,d){
    const geo = new THREE.BoxGeometry(w,h,d);
    const mat = new THREE.MeshStandardMaterial({color:0x6b7280});
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x,y,z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    obstacles.push(m);
  }
  addBox(-6,0.9,-10,3,1.8,3);
  addBox(6,0.9,-10,3,1.8,3);
  addBox(0,1.2,-20,14,2.4,3);

  // controls
  const controls = new THREE.PointerLockControls(camera, document.body);

  document.addEventListener('click', () => {
    if(!controls.isLocked) controls.lock();
  });

  scene.add(controls.getObject());

  // crosshair
  const ch = document.createElement('div'); ch.id='crosshair'; document.body.appendChild(ch);

  // player state
  const player = {
    char: 'knight',
    hp: 0, maxHp:0,
    abilityReady: true, abilityCd:0,
    shieldUntil:0,
    pos: new THREE.Vector3(0,1.6,2),
    velocity: new THREE.Vector3()
  };

  // bullets & effects
  const bullets = [];
  const bulletMeshPool = [];
  function makeBulletMesh(){
    const g = new THREE.SphereGeometry(0.06,8,8);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({emissive:0xffe4b5, emissiveIntensity:0.8}));
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }

  // enemies list
  const enemies = [];

  // utility UI helpers
  const hpEl = document.getElementById('hp');
  const maxHpEl = document.getElementById('maxHp');
  const abilityNameEl = document.getElementById('abilityName');
  const cdEl = document.getElementById('cd');
  const enemyCountEl = document.getElementById('enemyCount');

  // character buttons
  document.querySelectorAll('.charBtn').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.charBtn').forEach(x=>x.classList.remove('selected'));
      b.classList.add('selected');
      player.char = b.dataset.char;
      updateCharValues();
    });
  });

  function updateCharValues(){
    let max = 100;
    if(player.char==='knight') max=140;
    if(player.char==='archer') max=90;
    if(player.char==='wizard') max=75;
    if(player.char==='giant') max=220;
    player.maxHp = max;
    if(player.hp <= 0) player.hp = player.maxHp;
    abilityNameEl.innerText = abilityNameFor(player.char);
    hpEl.innerText = Math.round(player.hp);
    maxHpEl.innerText = player.maxHp;
  }

  function abilityNameFor(c){
    switch(c){
      case 'knight': return 'Shield Bash';
      case 'archer': return 'Volley';
      case 'wizard': return 'Fireball';
      case 'giant': return 'Ground Slam';
    }
    return '-';
  }

  // spawn / respawn robust
  const spawnBtn = document.getElementById('spawnBtn');
  spawnBtn.addEventListener('click', () => {
    respawnPlayer();
  });

  // spawn wave
  const waveBtn = document.getElementById('waveBtn');
  waveBtn.addEventListener('click', ()=> spawnEnemyWave(6));

  function respawnPlayer(){
    // place player at safe spawn location (no overlap)
    const spawnPos = new THREE.Vector3(0,1.6,6);
    player.pos.copy(spawnPos);
    controls.getObject().position.copy(player.pos);
    camera.position.copy(player.pos);
    player.hp = player.maxHp;
    player.abilityCd = 0;
    player.abilityReady = true;
    updateHud();
    toast('Player spawned');
  }

  // improved shooting: raycast hit + visual bullet
  const raycaster = new THREE.Raycaster();
  function shoot(){
    if(!controls.isLocked) return;
    const origin = new THREE.Vector3();
    origin.setFromMatrixPosition(camera.matrixWorld);
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();

    // immediate raycast for hit detection (robust)
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(enemies.map(e=>e.mesh), false);
    if(hits.length>0){
      const hit = hits[0];
      const enemy = enemies.find(en=>en.mesh === hit.object);
      if(enemy){
        let dmg = 20;
        if(player.char==='archer') dmg = 18;
        if(player.char==='wizard') dmg = 12;
        if(player.char==='giant') dmg = 35;
        enemy.hp -= dmg;
        spawnFloatingText('-'+Math.round(dmg), hit.point);
      }
    }

    // visual bullet
    const b = {pos: origin.clone(), dir: dir.clone(), speed: 60, ttl: 1.2, traveled:0};
    bullets.push(b);
    let bm;
    if(bulletMeshPool.length>0) bm = bulletMeshPool.pop();
    else bm = makeBulletMesh();
    bm.position.copy(b.pos);
    scene.add(bm);
    b.mesh = bm;
  }

  // ability use
  window.addEventListener('keydown', (e)=>{
    if(e.key==='1') useAbility();
    if(e.key==='r') respawnPlayer();
  });

  function useAbility(){
    if(!player.abilityReady) return;
    player.abilityReady = false;
    player.abilityCd = 8;
    const origin = new THREE.Vector3();
    origin.setFromMatrixPosition(camera.matrixWorld);
    if(player.char==='knight'){
      player.shieldUntil = performance.now() + 4000;
      toast('Shield activated');
    } else if(player.char==='archer'){
      // volley: spawn multiple raycasts in spread
      for(let i=0;i<5;i++){
        const spread = (i-2)*0.06;
        const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
        dir.applyAxisAngle(new THREE.Vector3(0,1,0), spread);
        raycaster.set(origin, dir);
        const hits = raycaster.intersectObjects(enemies.map(e=>e.mesh), false);
        if(hits[0]){
          const enemy = enemies.find(en=>en.mesh===hits[0].object);
          if(enemy){ enemy.hp -= 14; spawnFloatingText('-14', hits[0].point); }
        }
      }
      toast('Volley!');
    } else if(player.char==='wizard'){
      // area fireball in front
      const center = origin.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(6));
      areaDamage(center, 3.2, 40);
      spawnExplosion(center);
      toast('Fireball!');
    } else if(player.char==='giant'){
      const center = origin.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(4));
      areaDamage(center, 4.5, 30);
      enemies.forEach(e=>{
        const d = e.mesh.position.distanceTo(center);
        if(d<6){
          const push = e.mesh.position.clone().sub(center).normalize().multiplyScalar((6-d)*1.8);
          e.vel.add(push);
        }
      });
      spawnExplosion(center);
      toast('Ground Slam!');
    }
    updateHud();
  }

  function areaDamage(center, radius, dmg){
    enemies.forEach(e=>{
      const d = e.mesh.position.distanceTo(center);
      if(d<=radius){ e.hp -= dmg; spawnFloatingText('-'+Math.round(dmg), e.mesh.position); }
    });
  }

  // floating text
  const floating = [];
  function spawnFloatingText(text, pos){
    const sprite = makeSprite(text);
    sprite.position.copy(pos).add(new THREE.Vector3(0,1.6,0));
    scene.add(sprite);
    floating.push({sprite, ttl:1.6});
  }
  function makeSprite(text){
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width/2, canvas.height/2+12);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({map:tex});
    const s = new THREE.Sprite(mat);
    s.scale.set(2,1,1);
    return s;
  }

  // explosion visual
  function spawnExplosion(center){
    for(let i=0;i<12;i++){
      const a = Math.random()*Math.PI*2;
      const r = 0.5 + Math.random()*2.4;
      const pos = center.clone().add(new THREE.Vector3(Math.cos(a)*r, 0.6, Math.sin(a)*r));
      spawnFloatingText('*', pos);
    }
  }

  // enemies: improved AI with velocity clamp and simple obstacle avoidance
  function spawnEnemy(pos){
    const geo = new THREE.CapsuleGeometry(0.45, 0.7, 4, 8);
    const mat = new THREE.MeshStandardMaterial({color:0x912f2f});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.position.copy(pos);
    scene.add(mesh);
    enemies.push({mesh, hp: 60 + Math.random()*80, vel: new THREE.Vector3(), state:'seek', _lastHit:0});
    updateHud();
  }

  function spawnEnemyWave(n=6){
    for(let i=0;i<n;i++){
      const x = (Math.random()-0.5)*30;
      const z = -20 - Math.random()*30;
      const p = new THREE.Vector3(x,0.75,z);
      spawnEnemy(p);
    }
    toast('Enemy wave spawned');
  }

  // HUD updates
  function updateHud(){
    hpEl.innerText = Math.max(0, Math.round(player.hp));
    maxHpEl.innerText = player.maxHp;
    abilityNameEl.innerText = abilityNameFor(player.char);
    cdEl.innerText = Math.ceil(player.abilityCd);
    enemyCountEl.innerText = enemies.length;
  }

  // toasts
  let toastEl = null;
  function toast(msg){
    if(toastEl){ document.body.removeChild(toastEl); toastEl=null; }
    toastEl = document.createElement('div');
    toastEl.className = 'toast hud-fade';
    toastEl.innerText = msg;
    document.body.appendChild(toastEl);
    setTimeout(()=>{ if(toastEl){ toastEl.remove(); toastEl=null; } }, 1800);
  }

  // damage application to player
  function applyDamageToPlayer(dmg){
    const now = performance.now();
    if(player.shieldUntil && now < player.shieldUntil) dmg *= 0.45;
    player.hp -= dmg;
    // hit flash
    const flash = document.createElement('div');
    flash.style.position='fixed'; flash.style.left='0'; flash.style.top='0'; flash.style.width='100%'; flash.style.height='100%';
    flash.style.background='rgba(255,40,40,0.08)'; flash.style.zIndex='9999';
    document.body.appendChild(flash);
    setTimeout(()=> flash.remove(), 90);
    if(player.hp <= 0){
      player.hp = 0;
      updateHud();
      toast('You died — respawn with Spawn button (or press R)');
    }
    updateHud();
  }

  // game loop
  const clock = new THREE.Clock();
  function animate(){
    const dt = Math.min(clock.getDelta(), 0.05);

    // update bullets
    for(let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.pos.addScaledVector(b.dir, b.speed * dt);
      b.traveled += b.speed * dt;
      if(b.mesh){ b.mesh.position.copy(b.pos); }
      b.ttl -= dt;
      if(b.ttl <= 0){
        if(b.mesh){ scene.remove(b.mesh); bulletMeshPool.push(b.mesh); }
        bullets.splice(i,1);
      }
    }

    // enemies AI
    for(let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      if(!e || !e.mesh) continue;
      const toPlayer = controls.getObject().position.clone();
      toPlayer.y = e.mesh.position.y;
      const dir = toPlayer.clone().sub(e.mesh.position);
      const dist = dir.length();
      if(dist > 0.001) dir.normalize();
      // obstacle avoidance: simple steering away from nearby obstacles
      const avoid = new THREE.Vector3();
      obstacles.forEach(o=>{
        const d = e.mesh.position.distanceTo(o.position);
        if(d<3.2){
          const away = e.mesh.position.clone().sub(o.position).normalize().multiplyScalar((3.2-d)*0.5);
          avoid.add(away);
        }
      });
      // apply movement
      e.vel.add(dir.multiplyScalar( (dist>2.2 ? 1.2 : 0) * dt ));
      e.vel.add(avoid.multiplyScalar(dt));
      // clamp velocity
      const maxSpeed = 1.6;
      if(e.vel.length() > maxSpeed) e.vel.setLength(maxSpeed);
      // integrate
      e.mesh.position.addScaledVector(e.vel, dt);
      // simple friction
      e.vel.multiplyScalar(0.92);
      // attack if close
      if(e.mesh.position.distanceTo(controls.getObject().position) < 2.0){
        if(!e._lastHit || performance.now() - e._lastHit > 1000){
          applyDamageToPlayer(6 + Math.random()*6);
          e._lastHit = performance.now();
        }
      }
      // remove if dead
      if(e.hp <= 0){
        scene.remove(e.mesh);
        enemies.splice(i,1);
        spawnFloatingText('+XP', e.mesh.position);
        updateHud();
      }
    }

    // floating texts lifetime
    for(let i=floating.length-1;i>=0;i--){
      floating[i].ttl -= dt;
      floating[i].sprite.position.y += dt*0.6;
      if(floating[i].ttl <= 0){
        scene.remove(floating[i].sprite);
        floating.splice(i,1);
      }
    }

    // cooldowns
    if(!player.abilityReady){
      player.abilityCd -= dt;
      if(player.abilityCd <= 0){ player.abilityCd = 0; player.abilityReady = true; }
    }

    // update HUD cooldowns and HP
    updateHud();

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  // mouse input for shooting (debounced)
  let lastShot = 0;
  window.addEventListener('mousedown', (e)=>{
    if(e.button===0 && controls.isLocked){
      const now = performance.now();
      const rate = player.char==='archer' ? 150 : 220; // ms per shot
      if(now - lastShot > rate){
        shoot();
        lastShot = now;
      }
    }
  });

  // repair window resize
  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // initial spawn
  respawnPlayer();
  // spawn couple enemies for demo
  spawnEnemyWave(4);
  // start loop
  animate();

  // expose small API for debugging from console
  window._game = {scene, spawnEnemy, spawnEnemyWave, enemies, player};

})();
