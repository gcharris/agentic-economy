/**
 * Citadel Bay: The Sims Living Economy Game Engine
 * Renders an animated virtual town with districts, walking citizens,
 * courier carts, speech bubbles, and floating coin rewards.
 */

class SimsTownGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.animationId = null;
    
    // Game State
    this.citizens = [];
    this.couriers = [];
    this.floatingCoins = [];
    this.selectedEntity = null;
    this.step = 0;
    this.timeOfDay = "Morning 🌅";
    this.happiness = 85;
    this.prosperityStars = 3;

    // 4 Town Districts
    this.districts = {
      bazaar: {
        x: 620, y: 140, w: 180, h: 140,
        name: "Sally's Market & Cyber Cafe",
        icon: "🛒",
        sub: "Where Sally spends shopping coins",
        color: "#f43f5e",
        sign: "TOWN MARKET"
      },
      citadel: {
        x: 160, y: 140, w: 180, h: 140,
        name: "Bob's Bakery & Workshops",
        icon: "🥖",
        sub: "Where Bob bakes bread & saves profits",
        color: "#38bdf8",
        sign: "BOB'S BAKERY"
      },
      piggyBank: {
        x: 160, y: 380, w: 180, h: 140,
        name: "Penny's Golden Piggy Bank",
        icon: "🤖🐷",
        sub: "Automated high-yield savings vault",
        color: "#fbbf24",
        sign: "PIGGY VAULT"
      },
      castle: {
        x: 620, y: 380, w: 180, h: 140,
        name: "Royal Reserve Castle",
        icon: "🏰",
        sub: "The unbreakable town gold vault",
        color: "#10b981",
        sign: "CASTLE VAULT"
      }
    };

    // Roads between districts (loops)
    this.waypoints = [
      { x: 160, y: 140 }, // Bob's Bakery
      { x: 620, y: 140 }, // Market
      { x: 620, y: 380 }, // Castle
      { x: 160, y: 380 }  // Piggy Bank
    ];

    this._initCitizens();
    this._initEventListeners();
    this.startLoop();
  }

  _initCitizens() {
    const names = [
      { name: "Sally", icon: "🛒", role: "Shopper", color: "#f43f5e", base: "bazaar" },
      { name: "Bob", icon: "🥖", role: "Baker", color: "#38bdf8", base: "citadel" },
      { name: "Penny", icon: "🤖🐷", role: "Piggy Bank", color: "#fbbf24", base: "piggyBank" },
      { name: "Flash", icon: "🛹", role: "Bridge Skater", color: "#f59e0b", base: "bazaar" },
      { name: "Ben", icon: "👨‍💻", role: "Techie", color: "#38bdf8", base: "bazaar" },
      { name: "Carla", icon: "👩‍🎓", role: "Student", color: "#a855f7", base: "bazaar" },
      { name: "Dan", icon: "🧑‍🦱", role: "Gamer", color: "#10b981", base: "bazaar" },
      { name: "Arthur", icon: "🧙‍♂️", role: "Castle Keeper", color: "#10b981", base: "castle" }
    ];

    this.citizens = names.map((n, i) => {
      const baseDist = this.districts[n.base];
      return {
        id: `CIT-${i}`,
        name: n.name,
        icon: n.icon,
        role: n.role,
        color: n.color,
        x: baseDist.x + (Math.random() * 80 - 40),
        y: baseDist.y + (Math.random() * 50 - 25),
        targetX: baseDist.x,
        targetY: baseDist.y,
        speed: 0.8 + Math.random() * 0.8,
        mood: "😊",
        pocketMoney: 1200,
        thought: "Looking for something fun to buy!",
        thoughtTimer: 0
      };
    });
  }

  _initEventListeners() {
    if (!this.canvas) return;

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const clickY = (e.clientY - rect.top) * (this.canvas.height / rect.height);

      // Check click on citizens
      let clicked = null;
      for (const c of this.citizens) {
        const dist = Math.hypot(c.x - clickX, c.y - clickY);
        if (dist < 22) {
          clicked = { type: 'citizen', data: c };
          break;
        }
      }

      // Check click on districts
      if (!clicked) {
        for (const [key, d] of Object.entries(this.districts)) {
          if (Math.abs(d.x - clickX) < 80 && Math.abs(d.y - clickY) < 60) {
            clicked = { type: 'district', key, data: d };
            break;
          }
        }
      }

      this.selectedEntity = clicked;
      if (window.onSimsEntitySelected) {
        window.onSimsEntitySelected(clicked);
      }
    });
  }

  updateState(state) {
    if (!state) return;
    this.step = state.step || 0;
    const meta = state.sims_meta || {};
    this.happiness = meta.town_happiness || 85;
    this.prosperityStars = meta.prosperity_stars || 3;
    this.timeOfDay = meta.time_of_day || "Morning 🌅";

    // Update citizens with backend thoughts & balances
    if (state.agents && state.agents.length > 0) {
      this.citizens.forEach(c => {
        const match = state.agents.find(a => a.name.includes(c.name));
        if (match) {
          c.thought = match.thought || c.thought;
          c.pocketMoney = match.balances?.GENIUS_Stablecoin || 0;
          c.bankMoney = match.balances?.Tokenized_Deposit || 0;
          c.piggyMoney = match.balances?.Tokenized_MMF || 0;
          c.icon = match.avatar || c.icon;
        }
      });
    }

    // Spawn animated floating coin when recent transactions arrive
    if (state.recent_transactions && state.recent_transactions.length > 0) {
      const lastTx = state.recent_transactions[0];
      if (lastTx && lastTx.step === this.step) {
        this.triggerTransactionVisual(lastTx);
      }
    }
  }

  triggerTransactionVisual(tx) {
    // Determine location and effect
    let spawnX = 620, spawnY = 140;
    let label = "+$40";
    let color = "#10b981";

    if (tx.workflow_type === 'ATOMIC_DVP_SPLIT') {
      spawnX = 620; spawnY = 140;
      label = `🛍️ Bought coffee! (-$${tx.total_amount?.toFixed(0)})`;
      color = "#f43f5e";
      this.addFloatingCoin(160, 140, `+$${tx.producer_share?.toFixed(0)} to Bank! 🏦`, "#38bdf8");
      this.addFloatingCoin(160, 380, `+$${tx.csd_share?.toFixed(0)} to Vault! 🌾`, "#fbbf24");
    } else if (tx.workflow_type === 'PROGRAMMABLE_MMF_SWEEP') {
      spawnX = 160; spawnY = 380;
      label = `🌾 Swept to Piggy Bank! (+$${tx.amount?.toFixed(0)})`;
      color = "#fbbf24";
    } else if (tx.workflow_type === 'CROSS_LEDGER_ARBITRAGE') {
      spawnX = 390; spawnY = 140;
      label = `🚚 Armored Courier en route! ($${tx.amount?.toFixed(0)})`;
      color = "#a855f7";
    } else if (tx.workflow_type === 'MAYOR_STIMULUS') {
      spawnX = 620; spawnY = 240;
      label = `💸 MAYOR STIMULUS RAIN!`;
      color = "#10b981";
    }

    this.addFloatingCoin(spawnX, spawnY, label, color);
  }

  addFloatingCoin(x, y, text, color) {
    this.floatingCoins.push({
      x: x + (Math.random() * 30 - 15),
      y: y - 20,
      text: text,
      color: color || "#fbbf24",
      alpha: 1.0,
      life: 60
    });
  }

  startLoop() {
    const loop = () => {
      this.tick();
      this.draw();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  tick() {
    // 1. Move Citizens around their districts gently
    this.citizens.forEach(c => {
      const dx = c.targetX - c.x;
      const dy = c.targetY - c.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 5 || Math.random() < 0.015) {
        // Pick new random wander target nearby
        const baseKey = c.role.includes("Treasurer") ? "citadel" : (c.role.includes("Castle") ? "castle" : "bazaar");
        const base = this.districts[baseKey];
        c.targetX = base.x + (Math.random() * 110 - 55);
        c.targetY = base.y + (Math.random() * 80 - 40);
      } else {
        c.x += (dx / dist) * c.speed;
        c.y += (dy / dist) * c.speed;
      }

      if (c.thoughtTimer > 0) c.thoughtTimer--;
    });

    // 2. Animate Floating Coins
    for (let i = this.floatingCoins.length - 1; i >= 0; i--) {
      const coin = this.floatingCoins[i];
      coin.y -= 0.8;
      coin.life--;
      coin.alpha = coin.life / 60;
      if (coin.life <= 0) {
        this.floatingCoins.splice(i, 1);
      }
    }
  }

  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const now = Date.now() / 1000;

    // 1. Cozy Grass / Ground Backdrop
    ctx.fillStyle = "#0c1524";
    ctx.fillRect(0, 0, w, h);

    // Decorative grid grass tiles
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 2. Draw Cobblestone Connecting Roads
    ctx.beginPath();
    ctx.moveTo(160, 140);
    ctx.lineTo(620, 140);
    ctx.lineTo(620, 380);
    ctx.lineTo(160, 380);
    ctx.closePath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 26;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated Delivery Courier Truck on the Road
    const roadLength = 2 * (460 + 240);
    const courierProgress = (now * 0.15) % 1;
    let cx = 160, cy = 140;
    if (courierProgress < 0.33) {
      const p = courierProgress / 0.33;
      cx = 160 + 460 * p; cy = 140;
    } else if (courierProgress < 0.5) {
      const p = (courierProgress - 0.33) / 0.17;
      cx = 620; cy = 140 + 240 * p;
    } else if (courierProgress < 0.83) {
      const p = (courierProgress - 0.5) / 0.33;
      cx = 620 - 460 * p; cy = 380;
    } else {
      const p = (courierProgress - 0.83) / 0.17;
      cx = 160; cy = 380 - 240 * p;
    }

    // Draw Courier Vehicle
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚚', cx, cy - 4);
    ctx.font = 'bold 9px "Outfit", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('Armored Courier', cx, cy - 20);

    // 3. Draw 4 Districts & Buildings
    Object.values(this.districts).forEach(d => {
      // Glow boundary
      ctx.beginPath();
      ctx.roundRect(d.x - 75, d.y - 55, 150, 110, [14]);
      ctx.fillStyle = "rgba(18, 26, 47, 0.85)";
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Sign Banner
      ctx.beginPath();
      ctx.roundRect(d.x - 55, d.y - 70, 110, 20, [4]);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.font = 'bold 9px "Outfit", sans-serif';
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.fillText(d.sign, d.x, d.y - 56);

      // Building Icon
      ctx.font = '36px sans-serif';
      ctx.fillText(d.icon, d.x, d.y - 6);

      // Building Name
      ctx.font = 'bold 11px "Outfit", sans-serif';
      ctx.fillStyle = "#ffffff";
      ctx.fillText(d.name, d.x, d.y + 28);

      // Building Subtext
      ctx.font = '9px "Inter", sans-serif';
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(d.sub, d.x, d.y + 42);
    });

    // 4. Draw Citizens
    this.citizens.forEach(c => {
      // Little shadow under citizen
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 12, 10, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fill();

      // Avatar Emoji
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.icon, c.x, c.y);

      // Name label
      ctx.font = 'bold 9px "Outfit", sans-serif';
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(c.name, c.x, c.y + 22);

      // Pocket cash badge for consumers
      if (c.pocketMoney !== undefined) {
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = "#10b981";
        ctx.fillText(`$${Math.round(c.pocketMoney)}`, c.x, c.y + 32);
      }

      // Occasional Thought Bubble
      if (c.thought && (c.id === 'CIT-0' || c.id === 'CIT-4' || c.id === 'CIT-5')) {
        const bx = c.x + 24;
        const by = c.y - 28;
        
        ctx.beginPath();
        ctx.roundRect(bx - 40, by - 12, 120, 22, [6]);
        ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = '9px "Inter", sans-serif';
        ctx.fillStyle = "#f8fafc";
        ctx.textAlign = "left";
        const trimmed = c.thought.length > 20 ? c.thought.slice(0, 18) + '...' : c.thought;
        ctx.fillText(`💬 ${trimmed}`, bx - 34, by + 3);
      }
    });

    // 5. Draw Floating Coins / Transaction Popups
    this.floatingCoins.forEach(coin => {
      ctx.font = 'bold 12px "Outfit", sans-serif';
      ctx.fillStyle = coin.color;
      ctx.globalAlpha = coin.alpha;
      ctx.textAlign = 'center';
      ctx.fillText(coin.text, coin.x, coin.y);
      ctx.globalAlpha = 1.0;
    });

    // 6. Draw Town Info Badge in Top Corner
    ctx.beginPath();
    ctx.roundRect(20, 15, 210, 48, [8]);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.stroke();

    ctx.font = 'bold 12px "Outfit", sans-serif';
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "left";
    ctx.fillText(`🏡 Citadel Bay • ${this.timeOfDay}`, 32, 33);

    ctx.font = '10px "Inter", sans-serif';
    ctx.fillStyle = "#38bdf8";
    const starStr = "⭐".repeat(this.prosperityStars);
    ctx.fillText(`Prosperity: ${starStr} | Happiness: ${this.happiness}% 😊`, 32, 50);
  }
}

let simsTown = null;

function initSimsGame() {
  simsTown = new SimsTownGame('simsCanvas');
}

function updateSimsGame(state) {
  if (simsTown) {
    simsTown.updateState(state);
  }
}
