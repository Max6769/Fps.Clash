// Minimal Clash-style FPS prototype
// Characters: Knight (melee with shield ability), Archer (single-shot), Wizard (area damage), Giant (high HP, slam ability)
// Abilities use cooldown and simple effects. No external assets used — everything is built from primitives.
// Replace placeholder models with your own assets for a production build.

let scene, camera, renderer, controls;
let objects = [];
let bullets = [];
let enemies = [];
let clock = new THREE.Clock();
let player = {hp:100, maxHp:100, abilityReady:true, abilityCd:0, char:'knight'};
const GRAVITY = -9.8;

init();
animate();

function init(){
  // renderer and canvas
  renderer = new THREE.WebGLRenderer({canvas: document.getElementById('gameCanvas'), antialias:true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);

  // scene & camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8899aa);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0,1.6,0);

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  hemi.position.set(0, 50, 0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(-10,10,5);
  scene.add(dir);

  // floor
  const floorGeo = new THREE.PlaneGeometry(200,200);
  const floorMat = new THREE.MeshStandardMaterial({color:0x3a6b4f});
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);

  // simple arena objects
  addBox( -4, 0.75, -10, 2,1.5,2);
  addBox( 4, 0.75, -10, 2,1.5,2);
  addBox( 0, 0.75, -20, 12,1.5,2);

  // controls - pointer lock FPS
  controls = new THREE.PointerLockControls(camera, document.body);
  document.addEventListener('click', ()=> {
    controls.lock();
  });
  scene.add(controls.getObject());

  // simple crosshair
  const style = document.createElement('style');
  style.innerHTML = "#crosshair{position:fixed;left:50%;top:50%;width:10px;height:10px;margin-left:-5px;margin-top:-5px;pointer-events:none;z-index:9;}#crosshair:before{content:'';display:block;width:100%;height:2px;background:rgba(255,255,255,0.9);transform:translateY(4px);}#crosshair:after{content:'';display:block;height:100%;width:2px;background:rgba(255,255,255,0.9);transform:translateX(4px);}";
  document.head.appendChild(style);
  const ch = document.createElement('div'); ch.id='crosshair'; document.body.appendChild(ch);

  // UI hooks
  document.getElementById('spawnBtn').addEventListener('click', onSpawn);
  document.getElementById('character').addEventListener('change', (e)=> {
    player.char = e.target.value;
    updateAbilityUI();
  });

  // mouse shoot
  window.addEventListener('mousedown', (e)=> {
    if(e.button===0 && controls.isLocked) shoot();
  });

  // ability key
  window.addEventListener('keydown', (e)=>{
    if(e.key === '1') useAbility();
  });

  // spawn initial enemy wave
  spawnEnemyWave();

  window.addEventListener('resize', onWindowResize);
  updateHUD();
}

function onSpawn(){
  player.hp = player.maxHp = getCharMaxHp(player.char);
  updateHUD();
  updateAbilityUI();
}

function updateAbilityUI(){
  const name = getAbilityName(player.char);
  document.getElementById('abilityName').innerText = name;
}

function getCharMaxHp(c){
  switch(c){
    case 'knight': return 120;
    case 'archer': return 80;
    case 'wizard': return 70;
    case 'giant': return 200;
    default: return 100;
  }
}

function getAbilityName(c){
  switch(c){
    case 'knight': return 'Shield Bash';
    case 'archer': return 'Volley';
    case 'wizard': return 'Fireball';
    case 'giant': return 'Ground Slam';
    default: return '-';
  }
}

function shoot(){
  // different weapons per char
  const origin = new THREE.Vector3();
  origin.setFromMatrixPosition(camera.matrixWorld);
  const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
  let speed = 80;
  let dmg = 20;
  if(player.char==='archer'){ dmg = 18; speed = 120; }
  if(player.char==='giant'){ dmg = 35; speed = 60; }
  if(player.char==='wizard'){ dmg = 12; speed = 90; } // wizard weaker bullets, has area ability

  bullets.push({pos: origin.clone(), dir: dir.clone(), speed, dmg, ttl:3});
}

function useAbility(){
  if(!player.abilityReady) return;
  player.abilityReady = false;
  player.abilityCd = 8; // base cooldown
  const pos = new THREE.Vector3();
  pos.setFromMatrixPosition(camera.matrixWorld);
  if(player.char==='knight'){
    // shield: temporary damage reduction for 4 seconds
    player.shieldUntil = performance.now() + 4000;
    showFloatingText('Shield!', pos);
  } else if(player.char==='archer'){
    // volley: spawn 5 arrows in a spread
    for(let i=0;i<5;i++){
      const spread = (i-2)*0.08;
      const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
      dir.applyAxisAngle(new THREE.Vector3(0,1,0), spread);
      bullets.push({pos: pos.clone(), dir, speed:140, dmg:12, ttl:2});
    }
    showFloatingText('Volley!', pos);
  } else if(player.char==='wizard'){
    // fireball: area damage in front
    const center = pos.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(6));
    areaDamage(center, 3.2, 40);
    showExplosion(center);
    showFloatingText('Fireball!', center);
  } else if(player.char==='giant'){
    // ground slam: area stagger / damage
    const center = pos.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(4));
    areaDamage(center, 4.5, 30);
    // push back enemies
    enemies.forEach(e=>{
      const d = e.mesh.position.distanceTo(center);
      if(d<6){
        const push = e.mesh.position.clone().sub(center).normalize().multiplyScalar((6-d)*2);
        e.vel.add(push);
      }
    });
    showExplosion(center);
    showFloatingText('Slam!', center);
  }

  updateHUD();
}

function areaDamage(center, radius, dmg){
  enemies.forEach(e=>{
    const d = e.mesh.position.distanceTo(center);
    if(d <= radius){
      e.hp -= dmg;
      spawnDamageText(e.mesh.position, dmg);
    }
  });
}

// enemy spawner
function spawnEnemyWave(){
  for(let i=0;i<6;i++){
    const x = (Math.random()-0.5)*30;
    const z = -30 - Math.random()*40;
    spawnEnemy(new THREE.Vector3(x,0.75,z));
  }
}

function spawnEnemy(pos){
  const geo = new THREE.CapsuleGeometry(0.5, 0.8, 4, 8);
  const mat = new THREE.MeshStandardMaterial({color:0x912f2f});
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  enemies.push({mesh, hp:60 + Math.random()*60, vel: new THREE.Vector3(), target: null});
}

// simple box helper
function addBox(x,y,z,w,h,d){
  const geo = new THREE.BoxGeometry(w,h,d);
  const mat = new THREE.MeshStandardMaterial({color:0x6b8b8b});
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x,y,z);
  m.castShadow = true;
  scene.add(m);
  objects.push(m);
}

// damage floating texts & effects
const floatingTexts = [];
function showFloatingText(text, worldPos){
  const sprite = makeSprite(text);
  sprite.position.copy(worldPos).add(new THREE.Vector3(0,2,0));
  scene.add(sprite);
  floatingTexts.push({sprite, ttl:1.6});
}
function spawnDamageText(pos, dmg){
  showFloatingText('-'+Math.round(dmg), pos);
}
function makeSprite(text){
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = 'white';
  ctx.font = '36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width/2, canvas.height/2+12);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({map:tex});
  const sp = new THREE.Sprite(mat);
  sp.scale.set(2,1,1);
  return sp;
}
function showExplosion(center){
  // simple particle ring
  for(let i=0;i<18;i++){
    const a = Math.random()*Math.PI*2;
    const r = 0.6 + Math.random()*3.2;
    const pos = center.clone().add(new THREE.Vector3(Math.cos(a)*r, 0.5, Math.sin(a)*r));
    showFloatingText('*', pos);
  }
}

function onWindowResize(){
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(){
  const dt = clock.getDelta();
  requestAnimationFrame(animate);

  // bullets update
  for(let i=bullets.length-1;i>=0;i--){
    const b = bullets[i];
    b.pos.addScaledVector(b.dir, b.speed * dt);
    b.ttl -= dt;
    // check collisions with enemies
    for(let j=enemies.length-1;j>=0;j--){
      const e = enemies[j];
      const d = e.mesh.position.distanceTo(b.pos);
      if(d < 1.2){
        e.hp -= b.dmg;
        spawnDamageText(e.mesh.position, b.dmg);
        bullets.splice(i,1);
        break;
      }
    }
    if(b && b.ttl <= 0) bullets.splice(i,1);
  }

  // enemies simple AI: move towards player
  enemies.forEach((e, idx)=>{
    if(!e) return;
    const toPlayer = controls.getObject().position.clone();
    toPlayer.y = 0.75;
    const dir = toPlayer.clone().sub(e.mesh.position);
    const dist = dir.length();
    dir.normalize();
    // basic movement
    const speed = 1.2;
    e.mesh.position.addScaledVector(dir, speed * dt);
    // if close, attack
    if(dist < 2.2){
      // damage player occasionally
      if(!e._lastHit || performance.now() - e._lastHit > 1200){
        applyDamageToPlayer(8 + Math.random()*6);
        e._lastHit = performance.now();
      }
    }
  });

  // remove dead enemies
  for(let i=enemies.length-1;i>=0;i--){
    if(enemies[i].hp <= 0){
      scene.remove(enemies[i].mesh);
      enemies.splice(i,1);
    }
  }

  // floating texts lifetime
  for(let i=floatingTexts.length-1;i>=0;i--){
    floatingTexts[i].ttl -= dt;
    floatingTexts[i].sprite.position.y += dt*0.75;
    if(floatingTexts[i].ttl <= 0){
      scene.remove(floatingTexts[i].sprite);
      floatingTexts.splice(i,1);
    }
  }

  // update HUD cooldowns
  if(!player.abilityReady){
    player.abilityCd -= dt;
    if(player.abilityCd <= 0){
      player.abilityCd = 0;
      player.abilityReady = true;
    }
  }
  document.getElementById('cd').innerText = Math.ceil(player.abilityCd);

  // update health display
  document.getElementById('hp').innerText = Math.max(0, Math.round(player.hp));

  renderer.render(scene, camera);
}

// apply damage to player, with simple shield handling
function applyDamageToPlayer(dmg){
  const now = performance.now();
  // shield reduction
  if(player.shieldUntil && now < player.shieldUntil){
    dmg *= 0.4;
  }
  player.hp -= dmg;
  // hit indicator
  const flash = document.createElement('div');
  flash.style.position='fixed';
  flash.style.left='0'; flash.style.top='0'; flash.style.width='100%'; flash.style.height='100%';
  flash.style.background='rgba(255,50,50,0.14)';
  flash.style.zIndex='9999';
  document.body.appendChild(flash);
  setTimeout(()=> document.body.removeChild(flash), 120);
  if(player.hp <= 0){
    player.hp = 0;
    showFloatingText('You Died', controls.getObject().position.clone().add(new THREE.Vector3(0,1.8,0)));
    // respawn after short delay
    setTimeout(()=> { player.hp = player.maxHp; updateHUD(); }, 2000);
  }
}

// HUD updater
function updateHUD(){
  document.getElementById('hp').innerText = Math.round(player.hp);
  document.getElementById('ammoCount').innerText = '∞';
  document.getElementById('abilityName').innerText = getAbilityName(player.char);
  document.getElementById('cd').innerText = Math.ceil(player.abilityCd);
}

// very small helper: show damage text at position
// (already implemented above)
