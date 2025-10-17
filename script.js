
// Basic Three.js Setup with menu handling
let scene, camera, renderer, player, enemies = [], bullets = [];
let playing = false, selectedChar = 'knight', canShoot = true;

function init() {
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setSize(window.innerWidth, window.innerHeight);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 5);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  animate();
}

function spawnPlayer() {
  if (player) scene.remove(player);
  player = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0x00ffcc }));
  player.position.set(0, 1, 0);
  scene.add(player);
  camera.position.set(0, 2, 5);
}

function spawnEnemies(count = 5) {
  enemies.forEach(e => scene.remove(e));
  enemies = [];
  for (let i = 0; i < count; i++) {
    const enemy = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    enemy.position.set((Math.random() - 0.5) * 20, 1, (Math.random() - 0.5) * 20);
    scene.add(enemy);
    enemies.push(enemy);
  }
}

function shoot() {
  if (!canShoot) return;
  const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
  bullet.position.copy(camera.position);
  bullet.velocity = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(0.5);
  scene.add(bullet);
  bullets.push(bullet);
  canShoot = false;
  setTimeout(() => canShoot = true, 300);
}

function animate() {
  requestAnimationFrame(animate);
  bullets.forEach(b => b.position.add(b.velocity));
  renderer.render(scene, camera);
}

// --- UI Logic ---
document.addEventListener('DOMContentLoaded', () => {
  init();

  const startScreen = document.getElementById('startScreen');
  const gameMenu = document.getElementById('gameMenu');
  const spawnBtn = document.getElementById('spawnBtn');
  const waveBtn = document.getElementById('waveBtn');
  const startGameBtn = document.getElementById('startGame');

  document.querySelectorAll('.charBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedChar = btn.dataset.char;
      document.querySelectorAll('.charBtn').forEach(b => b.style.background = 'rgba(255,255,255,0.1)');
      btn.style.background = 'rgba(0,255,255,0.4)';
    });
  });

  startGameBtn.addEventListener('click', () => {
    startScreen.classList.remove('active');
    setTimeout(() => {
      startScreen.classList.add('hidden');
      gameMenu.classList.add('active');
    }, 700);
  });

  spawnBtn.addEventListener('click', () => {
    spawnPlayer();
    gameMenu.classList.remove('active');
    playing = true;
  });

  waveBtn.addEventListener('click', () => {
    spawnEnemies(5);
  });

  window.addEventListener('click', (e) => {
    if (playing) shoot();
  });
});
