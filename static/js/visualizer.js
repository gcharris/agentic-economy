/**
 * Interoperability Topology & ISO 20022 Packet Radar
 * Visualizes 4 Ledger Zones and animated packet transit along Swift rails.
 */

class InteropRadarVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.animationId = null;
    this.inTransitMessages = [];
    this.ledgerTotals = {};
    
    // Define 4 Ledger Zone coordinate anchors
    this.nodes = {
      "Citadel_Private_Bank": { x: 190, y: 130, label: "Citadel Private Bank", icon: "🏦", color: "#38bdf8", sub: "Tokenized Deposits" },
      "Bazaar_Public_DEX": { x: 570, y: 130, label: "Bazaar Public DEX", icon: "⚡", color: "#f43f5e", sub: "GENIUS Stablecoins" },
      "Core_CBDC_Settlement": { x: 190, y: 350, label: "Core CBDC Settlement", icon: "🏛️", color: "#10b981", sub: "Wholesale RTGS" },
      "DTCC_Collateral_AppChain": { x: 570, y: 350, label: "DTCC AppChain", icon: "⛓️", color: "#a855f7", sub: "Collateral Mobility" }
    };

    // Connections between ledgers
    this.rails = [
      { from: "Bazaar_Public_DEX", to: "Citadel_Private_Bank", label: "Swift ISO 20022 Interop" },
      { from: "Citadel_Private_Bank", to: "Core_CBDC_Settlement", label: "Wholesale RTGS Bridge" },
      { from: "Bazaar_Public_DEX", to: "Core_CBDC_Settlement", label: "DvP Collateral Split" },
      { from: "Core_CBDC_Settlement", to: "DTCC_Collateral_AppChain", label: "Collateral Mobility Rail" },
      { from: "Citadel_Private_Bank", to: "DTCC_Collateral_AppChain", label: "AppChain Repo Feed" }
    ];

    this.startLoop();
  }

  updateData(inTransitMessages, ledgerTotals) {
    this.inTransitMessages = inTransitMessages || [];
    this.ledgerTotals = ledgerTotals || {};
  }

  startLoop() {
    const render = () => {
      this.draw();
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  stopLoop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const now = Date.now() / 1000;

    // Background clearing
    ctx.clearRect(0, 0, w, h);

    // 1. Draw Connection Rails
    this.rails.forEach(rail => {
      const n1 = this.nodes[rail.from];
      const n2 = this.nodes[rail.to];
      if (!n1 || !n2) return;

      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Subtle traveling pulse
      const phase = (now * 0.4) % 1;
      const px = n1.x + (n2.x - n1.x) * phase;
      const py = n1.y + (n2.y - n1.y) * phase;

      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
      ctx.fill();
    });

    // 2. Draw In-Transit Messages as Moving Packets
    this.inTransitMessages.forEach((msg, idx) => {
      const srcNode = this.nodes[msg.source_ledger] || this.nodes["Bazaar_Public_DEX"];
      const dstNode = this.nodes[msg.target_ledger] || this.nodes["Citadel_Private_Bank"];

      const progress = 1 - (msg.latency_cycles / Math.max(1, msg.initial_latency));
      // Clamp 0.05 to 0.95
      const smoothProg = Math.max(0.08, Math.min(0.92, progress));

      const px = srcNode.x + (dstNode.x - srcNode.x) * smoothProg;
      const py = srcNode.y + (dstNode.y - srcNode.y) * smoothProg;

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
      ctx.fill();

      // Core packet
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();

      // Packet label
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = "#f8fafc";
      ctx.textAlign = 'center';
      ctx.fillText(`pacs.008 ($${msg.amount})`, px, py - 14);
    });

    // 3. Draw Ledger Nodes
    Object.keys(this.nodes).forEach(key => {
      const node = this.nodes[key];
      const bal = this.ledgerTotals[key] || 0;

      // Glow halo
      ctx.beginPath();
      ctx.arc(node.x, node.y, 48, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fill();
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Outer ripple
      ctx.beginPath();
      ctx.arc(node.x, node.y, 54, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Icon & Text
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.icon, node.x, node.y - 6);

      // Node Name
      ctx.font = 'bold 11px "Outfit", sans-serif';
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = 'top';
      ctx.fillText(node.label, node.x, node.y + 18);

      // Sub text / balance
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = node.color;
      const formattedBal = bal >= 1000 ? `$${(bal / 1000).toFixed(1)}k` : `$${Math.round(bal)}`;
      ctx.fillText(formattedBal, node.x, node.y + 32);
    });
  }
}

let interopRadar = null;

function initRadar() {
  interopRadar = new InteropRadarVisualizer('radarCanvas');
}

function updateRadar(inTransitMessages, ledgerBalances) {
  if (interopRadar) {
    interopRadar.updateData(inTransitMessages, ledgerBalances);
  }
}
