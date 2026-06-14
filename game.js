const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let score = 0, lives = 3, level = 1, gameRunning = true;
let notifications = [];
let playerRicochetChance = 0;
let stars = [];
let bullets = [];
let enemyBullets = [];
let enemies = [];
let explosions = [];
let powerups = [];
let keys = {};
let lastEnemySpawn = 0;
let enemySpawnInterval = 1500;
let lastShot = 0;
const baseShootInterval = 400;
let playerAtkSpeed = 1.0;
let playerBulletSpeed = 5;

// 玩家飞机（使用 Claude logo）
const player = {
	x: canvas.width / 2,
	y: canvas.height - 80,
	w: 56,
	h: 56,
	speed: 1,
	img: new Image(),
	imgLoaded: false,
	bulletCount: 1,
	ricochetChance: 0,
	shieldActive: false,
	shieldHits: 0,
	shieldExpiry: 0,
	parryActive: false,
	parryStart: 0,
	parryCooldownUntil: 0
};

// 加载 Claude logo
player.img.crossOrigin = 'anonymous';
player.img.onload = () => { player.imgLoaded = true; };
player.img.onerror = () => { player.imgLoaded = false; };
player.img.src = 'assets/textures/claude.png';

// 生成星空背景
for (let i = 0; i < 120; i++) {
	stars.push({
		x: Math.random() * canvas.width,
		y: Math.random() * canvas.height,
		r: Math.random() * 1.5 + 0.3,
		speed: Math.random() * 1.5 + 0.3,
		brightness: Math.random()
	});
}

document.addEventListener('keydown', e => { keys[e.key] = true; });
document.addEventListener('keyup', e => { keys[e.key] = false; });

function spawnEnemy() {
	const types = ['normal', 'fast', 'tank'];
	const type = level < 2 ? 'normal' : types[Math.floor(Math.random() * (level < 4 ? 2 : 3))];
	const lvlBonus = Math.floor((level - 1) / 2);
	let cfg = {
		normal: { w: 40, h: 40, hp: 1 + lvlBonus, speed: 0.6 + level * 0.08, color: '#e74c3c', score: 10, shootChance: 0.003 },
		fast: { w: 30, h: 30, hp: 1 + lvlBonus, speed: 1.2 + level * 0.12, color: '#e67e22', score: 20, shootChance: 0.002 },
		tank: { w: 52, h: 52, hp: 3 + lvlBonus * 2, speed: 0.4 + level * 0.04, color: '#8e44ad', score: 40, shootChance: 0.004 }
	}[type];
	enemies.push({
		x: Math.random() * (canvas.width - cfg.w) + cfg.w / 2,
		y: -cfg.h,
		...cfg, type,
		maxHp: cfg.hp,
		lastShot: -Infinity
	});
}

function drawPlayer() {
	if (player.imgLoaded) {
		ctx.save();
		// 发光效果
		ctx.shadowColor = '#d97706';
		ctx.shadowBlur = 18;
		ctx.drawImage(player.img, player.x - player.w / 2, player.y - player.h / 2, player.w, player.h);
		ctx.restore();
	} else {
		// 备用：橙色六边形
		ctx.save();
		ctx.shadowColor = '#d97706'; ctx.shadowBlur = 18;
		ctx.fillStyle = '#d97706';
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const a = (Math.PI / 3) * i - Math.PI / 6;
			ctx.lineTo(player.x + Math.cos(a) * 24, player.y + Math.sin(a) * 24);
		}
		ctx.closePath(); ctx.fill();
		ctx.restore();
	}
	// 格挡护盾视觉
	if (player.parryActive) {
		const now = performance.now();
		const elapsed = now - player.parryStart;
		const perfect = elapsed < 200;
		const alpha = perfect ? 0.45 : 0.22;
		const fillColor = perfect ? `rgba(0,255,255,${alpha})` : `rgba(80,160,255,${alpha})`;
		const glowColor = perfect ? '#00ffff' : '#50a0ff';
		const outerR = player.w * 0.7;
		const innerR = player.w * 0.6;
		const centralAngle = 120;
		const startAngle = (-90 - centralAngle / 2) * Math.PI / 180;  // -190° = 170°
		const endAngle = (-90 + centralAngle / 2) * Math.PI / 180;  // +10°
		ctx.save();
		ctx.shadowColor = glowColor;
		ctx.shadowBlur = perfect ? 28 : 14;
		ctx.beginPath();
		ctx.arc(player.x, player.y, outerR, startAngle, endAngle);
		ctx.arc(player.x, player.y, innerR, endAngle, startAngle, true);
		ctx.closePath();
		ctx.fillStyle = fillColor;
		ctx.fill();
		ctx.strokeStyle = glowColor;
		ctx.lineWidth = perfect ? 2.5 : 1.5;
		ctx.stroke();
		ctx.restore();
	}
}

function drawEnemy(e) {
	ctx.save();
	ctx.shadowColor = e.color; ctx.shadowBlur = 10;
	// 机身
	ctx.fillStyle = e.color;
	ctx.beginPath();
	ctx.moveTo(e.x, e.y + e.h / 2);
	ctx.lineTo(e.x - e.w / 2, e.y - e.h / 2);
	ctx.lineTo(e.x, e.y - e.h / 4);
	ctx.lineTo(e.x + e.w / 2, e.y - e.h / 2);
	ctx.closePath(); ctx.fill();
	// 血条（所有敌人，hp > 1 或已受伤时显示）
	if (e.maxHp > 1 || e.hp < e.maxHp) {
		const bw = e.w, bh = 5;
		const ratio = e.hp / e.maxHp;
		const barColor = ratio > 0.5 ? '#2ecc71' : ratio > 0.25 ? '#f39c12' : '#e74c3c';
		ctx.fillStyle = '#333';
		ctx.fillRect(e.x - bw / 2, e.y - e.h / 2 - 9, bw, bh);
		ctx.fillStyle = barColor;
		ctx.fillRect(e.x - bw / 2, e.y - e.h / 2 - 9, bw * ratio, bh);
	}
	ctx.restore();
}

function drawBullet(b, color) {
	ctx.save();
	ctx.shadowColor = color; ctx.shadowBlur = 8;
	ctx.fillStyle = color;
	ctx.translate(b.x, b.y);
	ctx.rotate(b.angle || 0);
	ctx.beginPath();
	ctx.roundRect(-3, -10, 6, 20, 3);
	ctx.fill();
	ctx.restore();
}

function drawExplosion(ex) {
	const progress = ex.frame / ex.maxFrame;
	const alpha = 1 - progress;
	ex.particles.forEach(p => {
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.fillStyle = p.color;
		ctx.beginPath();
		ctx.arc(ex.x + p.dx * progress * 60, ex.y + p.dy * progress * 60, p.r * (1 - progress * 0.5), 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	});
}

function createExplosion(x, y, big) {
	const colors = ['#ff4500', '#ff8c00', '#ffd700', '#fff', '#ff6347'];
	const count = big ? 20 : 10;
	explosions.push({
		x, y, frame: 0, maxFrame: big ? 40 : 25,
		particles: Array.from({ length: count }, () => ({
			dx: (Math.random() - 0.5) * 2,
			dy: (Math.random() - 0.5) * 2,
			r: Math.random() * (big ? 8 : 4) + 2,
			color: colors[Math.floor(Math.random() * colors.length)]
		}))
	});
}

// 火花粒子池
const sparks = [];

const sfxPerfectParry = new Audio('assets/sounds/perfect-parry.wav');
const sfxUnexactParry = new Audio('assets/sounds/unexact-parry.wav');
const sfxPowerup = new Audio('assets/sounds/powerup.mp3');

let shockwaves = [];

function createParrySparks(x, y, perfect) {
	const colors = perfect
		? ['#00ffff', '#ffffff', '#aaffff', '#80ffff']
		: ['#50a0ff', '#ffffff', '#aad4ff', '#ffd700'];
	const count = perfect ? 18 : 10;
	// 完美格挡：在格挡点生成一圈向外扩散的冲击波
	if (perfect) {
		shockwaves.push({ x, y, r: 6, maxR: 70, life: 1 });
	}
	for (let i = 0; i < count; i++) {
		// 完美格挡：火花朝玩家前方（上方）锥形喷射；普通格挡保持四散
		const angle = perfect
			? -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 2 / 3)
			: Math.random() * Math.PI * 2;
		const speed = Math.random() * (perfect ? 4.5 : 3) + (perfect ? 2.5 : 1.5);
		sparks.push({
			x, y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			life: 1,
			decay: perfect ? (Math.random() * 0.008 + 0.004) : (Math.random() * 0.02 + 0.01),
			r: Math.random() * (perfect ? 3 : 2) + 1,
			color: colors[Math.floor(Math.random() * colors.length)]
		});
	}
}

function updateAndDrawSparks() {
	for (let i = sparks.length - 1; i >= 0; i--) {
		const s = sparks[i];
		s.x += s.vx;
		s.y += s.vy;
		s.vy += 0.08; // 重力
		s.life -= s.decay;
		if (s.life <= 0) { sparks.splice(i, 1); continue; }
		ctx.save();
		ctx.globalAlpha = s.life;
		ctx.fillStyle = s.color;
		ctx.shadowColor = s.color;
		ctx.shadowBlur = 6;
		ctx.beginPath();
		ctx.arc(s.x, s.y, s.r * s.life, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
	// 冲击波：快速向外扩张的圆环，随生命衰减淡出
	for (let i = shockwaves.length - 1; i >= 0; i--) {
		const sw = shockwaves[i];
		sw.r += (sw.maxR - sw.r) * 0.15;
		sw.life -= 0.04;
		if (sw.life <= 0) { shockwaves.splice(i, 1); continue; }
		ctx.save();
		ctx.globalAlpha = sw.life;
		ctx.strokeStyle = '#aaffff';
		ctx.shadowColor = '#00ffff';
		ctx.shadowBlur = 12;
		ctx.lineWidth = 3 * sw.life;
		ctx.beginPath();
		ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}
}

function update(timestamp) {
	if (!gameRunning) return;

	// 移动玩家
	if ((keys['ArrowLeft'] || keys['a']) && player.x - player.w / 2 > 0) player.x -= player.speed;
	if ((keys['ArrowRight'] || keys['d']) && player.x + player.w / 2 < canvas.width) player.x += player.speed;
	if ((keys['ArrowUp'] || keys['w']) && player.y - player.h / 2 > 0) player.y -= player.speed;
	if ((keys['ArrowDown'] || keys['s']) && player.y + player.h / 2 < canvas.height) player.y += player.speed;

	// 射击
	if ((keys['j'] || keys['J']) && timestamp - lastShot > baseShootInterval / playerAtkSpeed) {
		playPewSound();
		const count = player.bulletCount;
		const spacing = count > 1 ? Math.min(15, 100 / (count - 1)) : 0;
		const totalWidth = spacing * (count - 1);
		for (let i = 0; i < count; i++) {
			const bx = player.x - totalWidth / 2 + spacing * i;
			bullets.push({ x: bx, y: player.y - player.h / 2, angle: 0 });
		}
		lastShot = timestamp;
	}

	// 护盾计时
	if (player.shieldActive && timestamp > player.shieldExpiry) {
		player.shieldActive = false;
		player.shieldHits = 0;
	}

	// K键格挡
	if (keys['k'] || keys['K']) {
		if (!player.parryActive && timestamp >= player.parryCooldownUntil) {
			player.parryActive = true;
			player.parryStart = timestamp;
		}
	} else {
		if (player.parryActive) {
			// 格挡结束时开始计算冷却
			player.parryCooldownUntil = timestamp + 1000;
		}
		player.parryActive = false;
	}
	// 超时自动结束
	if (player.parryActive && timestamp - player.parryStart > 500) {
		player.parryActive = false;
		player.parryCooldownUntil = timestamp + 1000;
	}

	// 生成敌人
	const interval = Math.max(500, enemySpawnInterval - (level - 1) * 150);
	if (timestamp - lastEnemySpawn > interval) {
		spawnEnemy();
		lastEnemySpawn = timestamp;
	}

	// 更新星星
	stars.forEach(s => { s.y += s.speed; if (s.y > canvas.height) s.y = 0; });

	// 更新子弹
	bullets = bullets.filter(b => b.y > -20 && b.x > -20 && b.x < canvas.width + 20);
	bullets.forEach(b => {
		b.x += Math.sin(b.angle || 0) * playerBulletSpeed;
		b.y -= Math.cos(b.angle || 0) * playerBulletSpeed;
	});

	// 敌方子弹
	enemyBullets = enemyBullets.filter(b => b.y < canvas.height + 20);
	enemyBullets.forEach(b => b.y += 3);

	// 更新敌人
	enemies.forEach(e => {
		e.y += e.speed;
		// 敌人每1秒射击一次，出生即可射击
		if (timestamp - e.lastShot >= 2500) {
			enemyBullets.push({ x: e.x, y: e.y + e.h / 2, angle: 0, shooter: e });
			e.lastShot = timestamp;
		}
	});
	enemies = enemies.filter(e => e.y < canvas.height + 60);

	// 生成道具
	powerups.forEach(p => p.y += 1.5);
	powerups = powerups.filter(p => p.y < canvas.height + 40);

	// 玩家拾取道具
	powerups = powerups.filter(p => {
		if (Math.abs(p.x - player.x) < player.w / 2 + 14 && Math.abs(p.y - player.y) < player.h / 2 + 14) {
			sfxPowerup.currentTime = 0;
			sfxPowerup.play();
			if (p.type === 'multishot') {
				player.bulletCount = Math.min(player.bulletCount + 1, 20);
				showNotification('⚔️ 多重射击 +1（共' + player.bulletCount + '发）');
			} else if (p.type === 'ricochet') {
				player.ricochetChance = Math.min(1, player.ricochetChance + 0.1);
				showNotification('🔀 折射概率 +10%（共' + Math.round(player.ricochetChance * 100) + '%）');
			} else if (p.type === 'heal') {
				lives += 1;
				document.getElementById('lives').textContent = lives;
				showNotification('❤️ 生命值 +1（共 ' + lives + '）');
			} else if (p.type === 'atkspeed') {
				playerAtkSpeed = Math.min(10, playerAtkSpeed + 0.1);
				showNotification('🔥 攻击速度 ' + Math.round(playerAtkSpeed * 100) + '%（冷却 ' + Math.round(baseShootInterval / playerAtkSpeed) + 'ms）');
			} else if (p.type === 'bulletspeed') {
				playerBulletSpeed = Math.min(playerBulletSpeed + 0.5, 35);
				showNotification('🧨 子弹速度提升！速度 ' + playerBulletSpeed.toFixed(1));
			} else if (p.type === 'movespeed') {
				player.speed = Math.min(player.speed + 0.15, 6);
				showNotification('🚀 移动速度提升！速度 ' + player.speed.toFixed(2));
			} else if (p.type === 'shield') {
				player.shieldActive = true;
				player.shieldHits = 1;
				player.shieldExpiry = timestamp + 30000;
				showNotification('🛡️ 护盾激活！可抵挡1次伤害');
			}
			return false;
		}
		return true;
	});

	// 更新通知
	notifications = notifications.filter(n => timestamp - n.born < 2200);

	// 碰撞：玩家子弹击中敌人
	bullets.forEach((b, bi) => {
		if (b._dead) return;
		enemies.forEach((e, ei) => {
			if (b._dead) return;
			if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) {
				b._dead = true;
				e.hp--;
				// 折射判定
				if (Math.random() < player.ricochetChance) {
					const others = enemies.filter((_, j) => j !== ei);
					if (others.length > 0) {
						let nearest = others.reduce((a, c) => {
							const da = (a.x - b.x) ** 2 + (a.y - b.y) ** 2, dc = (c.x - b.x) ** 2 + (c.y - b.y) ** 2;
							return dc < da ? c : a;
						});
						// 预测敌人位置：根据子弹飞行帧数估算敌人届时的坐标
						const dist = Math.hypot(nearest.x - b.x, nearest.y - b.y);
						const travelFrames = dist / playerBulletSpeed;
						const predX = nearest.x;
						const predY = nearest.y + nearest.speed * travelFrames;
						const angle = Math.atan2(predX - b.x, -(predY - b.y));
						bullets.push({ x: b.x, y: b.y, angle, _ricochet: (b._ricochet || 0) + 1 });
					}
				}
				if (e.hp <= 0) {
					createExplosion(e.x, e.y, e.type === 'tank');
					score += e.score;
					document.getElementById('score').textContent = score;
					level = Math.floor(score / 200) + 1;
					document.getElementById('level').textContent = level;
					// 随机掉落道具
					if (Math.random() < 0.4) {
						// 权重表
						const weightedTypes = [
							...Array(10).fill('multishot'),
							...Array(10).fill('atkspeed'),
							...Array(10).fill('shield'),
							...Array(10).fill('bulletspeed'),
							...Array(10).fill('movespeed'),
							...Array(10).fill('ricochet'),
							...Array(1).fill('heal'),
						];
						powerups.push({ x: e.x, y: e.y, type: weightedTypes[Math.floor(Math.random() * weightedTypes.length)] });
					}
					enemies.splice(ei, 1);
				}
			}
		});
	});
	bullets = bullets.filter(b => !b._dead);

	// 碰撞：敌方子弹/敌机击中玩家
	const pr = player.w / 2 - 8;
	[...enemyBullets, ...enemies].forEach((obj, i) => {
		const dx = obj.x - player.x, dy = obj.y - player.y;
		if (Math.sqrt(dx * dx + dy * dy) < pr + (obj.h ? obj.h / 2 - 8 : 4)) {
			// 道具护盾优先
			if (player.shieldActive && player.shieldHits > 0) {
				player.shieldHits--;
				if (player.shieldHits <= 0) player.shieldActive = false;
				if (i < enemyBullets.length) enemyBullets.splice(i, 1);
				else enemies.splice(i - enemyBullets.length, 1);
				return;
			}
			// K键格挡盾
			if (player.parryActive) {
				const parryElapsed = timestamp - player.parryStart;
				if (parryElapsed < 200) {
					// 完美格挡：喷火花并立即结束格挡状态
					sfxPerfectParry.currentTime = 0;
					sfxPerfectParry.play();
					createParrySparks(player.x, player.y, true);
					player.parryActive = false;
					player.parryCooldownUntil = timestamp + 1000;
					// 完美格挡：免伤并向发射者（敌机）预测位置发射子弹
					const shooter = (i < enemyBullets.length && obj.shooter) ? obj.shooter : obj;
					const dist = Math.hypot(shooter.x - player.x, shooter.y - player.y);
					const travelTime = dist / playerBulletSpeed;
					const targetX = shooter.x;
					const targetY = shooter.y + (shooter.speed || 0) * travelTime;
					const angle = Math.atan2(targetX - player.x, -(targetY - player.y));
					bullets.push({ x: player.x, y: player.y - player.h / 2, angle, _parryCounter: true });
					showNotification('⚡️完美格挡！');
					if (i < enemyBullets.length) enemyBullets.splice(i, 1);
					else enemies.splice(i - enemyBullets.length, 1);
					return;
				} else {
					// 不精准格挡音效
					sfxUnexactParry.currentTime = 0;
					sfxUnexactParry.play();
					// 后0.3秒：25%概率免伤，但重置攻击冷却
					if (Math.random() < 0.25) {
						lastShot = timestamp;
						showNotification('🛡️格挡！');
						if (i < enemyBullets.length) enemyBullets.splice(i, 1);
						else enemies.splice(i - enemyBullets.length, 1);
						return;
					}
					// 未格挡，正常受伤
				}
			}
			createExplosion(player.x, player.y, true);
			if (i < enemyBullets.length) enemyBullets.splice(i, 1);
			else enemies.splice(i - enemyBullets.length, 1);
			lives--;
			document.getElementById('lives').textContent = lives;
			if (lives <= 0) endGame();
			else { player.x = canvas.width / 2; player.y = canvas.height - 80; }
		}
	});

	function showNotification(text) {
		notifications.push({ text, born: performance.now() });
		if (notifications.length > 4) notifications.shift();
	}

	// 更新爆炸
	explosions.forEach(ex => ex.frame++);
	explosions = explosions.filter(ex => ex.frame < ex.maxFrame);
}

function draw() {
	// 背景
	ctx.fillStyle = '#050a1a';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// 星空
	stars.forEach(s => {
		ctx.save();
		ctx.globalAlpha = 0.4 + s.brightness * 0.6;
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	});

	// 敌人
	enemies.forEach(e => drawEnemy(e));

	// 子弹
	bullets.forEach(b => drawBullet(b, '#d97706'));
	enemyBullets.forEach(b => drawBullet(b, '#e74c3c'));

	// 道具
	powerups.forEach(p => {
		const cfg = {
			heal: { color: '#ff4d6d', label: '❤️' },
			multishot: { color: '#00e5ff', label: '⚔️' },
			atkspeed: { color: '#ffe600', label: '🔥' },
			bulletspeed: { color: '#00ffcc', label: '🧨' },
			movespeed: { color: '#a78bfa', label: '🚀' },
			shield: { color: '#7fff7f', label: '🛡️' },
			ricochet: { color: '#ff9ef7', label: '🔀' }
		}[p.type];
		ctx.save();
		ctx.shadowColor = cfg.color; ctx.shadowBlur = 14;
		ctx.strokeStyle = cfg.color; ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
		ctx.stroke();
		ctx.font = '14px sans-serif';
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText(cfg.label, p.x, p.y);
		ctx.restore();
	});

	// 玩家
	drawPlayer();

	// 护盾光环
	if (player.shieldActive) {
		ctx.save();
		ctx.strokeStyle = '#7fff7f';
		ctx.lineWidth = 3;
		ctx.shadowColor = '#7fff7f'; ctx.shadowBlur = 18;
		ctx.globalAlpha = 0.75;
		ctx.beginPath();
		ctx.arc(player.x, player.y, player.w / 2 + 10, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	// 爆炸
	explosions.forEach(ex => drawExplosion(ex));
	// 格挡火花
	updateAndDrawSparks();

	// 道具提示通知
	const now = performance.now();
	notifications.forEach((n, i) => {
		const age = now - n.born;
		const alpha = age < 1600 ? 1 : 1 - (age - 1600) / 600;
		const y = canvas.height - 60 - i * 28;
		ctx.save();
		ctx.globalAlpha = Math.max(0, alpha);
		ctx.font = 'bold 15px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const w = ctx.measureText(n.text).width + 24;
		ctx.fillStyle = 'rgba(0,0,0,0.55)';
		ctx.beginPath();
		ctx.roundRect(canvas.width / 2 - w / 2, y - 12, w, 24, 6);
		ctx.fill();
		ctx.fillStyle = '#ffe066';
		ctx.shadowColor = '#ffe066';
		ctx.shadowBlur = 8;
		ctx.fillText(n.text, canvas.width / 2, y);
		ctx.restore();
	});
}

function gameLoop(timestamp) {
	update(timestamp);
	draw();
	if (gameRunning) requestAnimationFrame(gameLoop);
}

function endGame() {
	gameRunning = false;
	document.getElementById('finalScore').textContent = score;
	document.getElementById('gameOver').style.display = 'block';
}

function restartGame() {
	score = 0; lives = 3; level = 1;
	bullets = []; enemyBullets = []; enemies = []; explosions = []; powerups = [];
	playerAtkSpeed = 1.0;
	playerBulletSpeed = 7;
	player.speed = 1.5;
	player.x = canvas.width / 2; player.y = canvas.height - 80;
	player.bulletCount = 1;
	player.ricochetChance = 0;
	player.shieldActive = false; player.shieldHits = 0; player.shieldExpiry = 0;
	document.getElementById('score').textContent = 0;
	document.getElementById('lives').textContent = 3;
	document.getElementById('level').textContent = 1;
	document.getElementById('gameOver').style.display = 'none';
	gameRunning = true;
	requestAnimationFrame(gameLoop);
}

// 资源预加载：等待音效与玩家图片加载完成后再隐藏加载页并开始游戏
function startGame() {
	const loadingEl = document.getElementById('loading');
	if (loadingEl) loadingEl.style.display = 'none';
	requestAnimationFrame(gameLoop);
}

(function preloadAssets() {
	const tasks = [];
	// 音效：等待可完整播放（error 也算结束，避免缺资源时卡死）
	[
		sfxPerfectParry,
		sfxUnexactParry,
		sfxPowerup,
		...pewSoundPool
	].forEach(a => {
		a.preload = 'auto';
		tasks.push(new Promise(resolve => {
			if (a.readyState >= 4) return resolve();
			a.addEventListener('canplaythrough', resolve, { once: true });
			a.addEventListener('error', resolve, { once: true });
			a.load();
		}));
	});
	// 玩家图片
	tasks.push(new Promise(resolve => {
		if (player.imgLoaded) return resolve();
		player.img.addEventListener('load', resolve, { once: true });
		player.img.addEventListener('error', resolve, { once: true });
	}));
	// 兜底：最多等待 8 秒，防止个别资源加载失败时一直停在加载页
	const timeout = new Promise(resolve => setTimeout(resolve, 8000));
	Promise.race([Promise.all(tasks), timeout]).then(startGame);
})();
