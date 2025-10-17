(() => {
  const canvas = document.getElementById('gameCanvas');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const startScreen = document.getElementById('startScreen');
  const lobby = document.getElementById('lobby');
  const hud = document.getElementById('hud');
  const startCharRow = document.getElementById('startCharRow');
  const lobbyCharRow = document.getElementById('lobbyCharRow');
  const startBattle = document.getElementById('startBattle');
  const spawnBtn = document.getElementById('spawnBtn');
  const waveBtn = document.getElementById('waveBtn');
  const hpEl = document.getElementById('hp');
  const maxHpEl = document.getElementById('maxHp');
  const abilityNameEl = document.getElementById('abilityName');
  const cdEl = document.getElementById('cd');
  const enemyCountEl = document.getElementById('enemyCount');

  let state = "start";
  let selectedChar = "knight";
  let player = null;
  let enemies = [];
  let bullets = [];

  // THREE.js setup
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7faab0);
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const controls = new THREE.PointerLockControls(camera, document.body);
  scene.add(controls.getObject());
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x336644 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7);
  scene.add(light);

  // Helpers
  function setState(newState) {
    state = newState;
    loadingOverlay.classList.add("hidden");
    startScreen.classList.add("hidden");
    lobby.classList.add("hidden");
    hud.classList.add("hidden");

    if (newState === "start") startScreen.classList.remove("hidden");
    if (newState === "lobby") lobby.classList.remove("hidden");
    if (newState === "playing") hud.classList.remove("hidden");
  }

  function flashMessage(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      background: "rgba(10,10,20,0.8)",
      padding: "8px 12px",
      borderRadius: "8px",
      color: "#fff",
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // Player setup
  function spawnPlayer() {
    if (player) scene.remove(player.mesh);
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.2, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x33ffbb })
    );
    mesh.position.set(0, 1, 5);
    scene.add(mesh);
    player = { mesh, hp: 100, maxHp: 100, abilityCd: 0 };
    camera.position.set(mesh.position.x, mesh.position.y + 1, mesh.position.z + 3);
    flashMessage("Spawned " + selectedChar);
  }

  function spawnEnemy() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1.5, 1),
      new THREE.MeshStandardMaterial({ color: 0xff6666 })
    );
    mesh.position.set((Math.random() - 0.5) * 20, 0.75, -10 - Math.random() * 10);
    scene.add(mesh);
    enemies.push({ mesh, hp: 50 });
  }

  function shoot() {
    if (!player) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const raycaster = new THREE.Raycaster(camera.position, dir);
    const hits = raycaster.intersectObjects(enemies.map((e) => e.mesh));
    if (hits.length > 0) {
      const enemy = enemies.find((e) => e.mesh === hits[0].object);
      enemy.hp -= 25;
      flashMessage("Hit!");
      if (enemy.hp <= 0) {
        scene.remove(enemy.mesh);
        enemies = enemies.filter((e) => e !== enemy);
      }
    }
  }

  // Abilities
  function useAbility() {
    flashMessage(selectedChar + " ability used!");
  }

  // Setup UI
  function setupUI() {
    startCharRow.querySelectorAll(".charBtn").forEach((btn) => {
      btn.onclick = () => {
        selectedChar = btn.dataset.char;
        startCharRow.querySelectorAll(".charBtn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
    });

    lobbyCharRow.querySelectorAll(".charBtn").forEach((btn) => {
      btn.onclick = () => {
        selectedChar = btn.dataset.char;
        lobbyCharRow.querySelectorAll(".charBtn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
    });

    startBattle.onclick = () => setState("lobby");
    spawnBtn.onclick = () => {
      spawnPlayer();
      setState("playing");
    };
    waveBtn.onclick = () => {
      for (let i = 0; i < 5; i++) spawnEnemy();
    };

    canvas.addEventListener("click", () => {
      if (state === "playing") controls.lock();
    });

    window.addEventListener("mousedown", (e) => {
      if (state === "playing" && e.button === 0) shoot();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "1") useAbility();
      if (e.key === "r") spawnPlayer();
    });
  }

  // Animation loop
  const clock = new THREE.Clock();
  function animate() {
    const dt = clock.getDelta();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  // Init
  function init() {
    setupUI();
    animate();
    // Force start screen after short load
  }

  window.addEventListener("DOMContentLoaded", init);
})();
