/**
 * Lightweight HTML5 Canvas Chart Engine for Institutional Sandbox
 * Zero external CDN dependencies for resilient local and offline execution.
 */

class LightweightCanvasChart {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.options = Object.assign({
      padding: { top: 20, right: 20, bottom: 30, left: 55 },
      gridColor: 'rgba(255, 255, 255, 0.05)',
      textColor: '#64748b',
      font: '10px "JetBrains Mono", monospace',
      showLegend: true
    }, options);
  }

  clear() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  renderMultiLine(seriesList, xKey = 'step') {
    if (!this.ctx || !seriesList || seriesList.length === 0) return;
    this.clear();

    const w = this.canvas.width;
    const h = this.canvas.height;
    const pad = this.options.padding;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Find min and max across all series
    let minY = Infinity;
    let maxY = -Infinity;
    let maxLen = 0;

    seriesList.forEach(s => {
      if (s.data && s.data.length > 0) {
        maxLen = Math.max(maxLen, s.data.length);
        s.data.forEach(pt => {
          const val = Number(pt[s.key] || 0);
          if (val < minY) minY = val;
          if (val > maxY) maxY = val;
        });
      }
    });

    if (minY === Infinity || maxY === -Infinity) {
      minY = 0;
      maxY = 100;
    }
    if (minY === maxY) {
      minY *= 0.9;
      maxY *= 1.1;
    }
    // Add margin to Y
    const yMargin = (maxY - minY) * 0.1 || 10;
    minY = Math.max(0, minY - yMargin);
    maxY = maxY + yMargin;

    // Draw horizontal grid lines
    const gridRows = 4;
    this.ctx.strokeStyle = this.options.gridColor;
    this.ctx.lineWidth = 1;
    this.ctx.fillStyle = this.options.textColor;
    this.ctx.font = this.options.font;

    for (let i = 0; i <= gridRows; i++) {
      const yVal = minY + (maxY - minY) * (i / gridRows);
      const yPos = h - pad.bottom - (plotH * (i / gridRows));
      
      this.ctx.beginPath();
      this.ctx.moveTo(pad.left, yPos);
      this.ctx.lineTo(w - pad.right, yPos);
      this.ctx.stroke();

      // Label Y
      const formattedVal = yVal >= 1000 ? `$${(yVal / 1000).toFixed(1)}k` : `$${Math.round(yVal)}`;
      this.ctx.textAlign = 'right';
      this.ctx.fillText(formattedVal, pad.left - 8, yPos + 3);
    }

    if (maxLen <= 1) return;

    // Draw each series
    seriesList.forEach(series => {
      const data = series.data;
      if (!data || data.length < 2) return;

      this.ctx.strokeStyle = series.color || '#38bdf8';
      this.ctx.lineWidth = series.width || 2;
      this.ctx.setLineDash(series.dashed ? [4, 4] : []);
      this.ctx.beginPath();

      data.forEach((pt, idx) => {
        const xPos = pad.left + (plotW * (idx / (maxLen - 1)));
        const yVal = Number(pt[series.key] || 0);
        const yPos = h - pad.bottom - (plotH * ((yVal - minY) / (maxY - minY)));

        if (idx === 0) {
          this.ctx.moveTo(xPos, yPos);
        } else {
          this.ctx.lineTo(xPos, yPos);
        }
      });
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Fill area if requested
      if (series.fill) {
        this.ctx.lineTo(pad.left + plotW, h - pad.bottom);
        this.ctx.lineTo(pad.left, h - pad.bottom);
        this.ctx.closePath();
        this.ctx.fillStyle = series.fill;
        this.ctx.fill();
      }
    });
  }
}

// Global Chart Instances
let chartLiquidity = null;
let chartYield = null;
let chartVelocity = null;

function initCharts() {
  chartLiquidity = new LightweightCanvasChart('chartLiquidityRotation', {
    padding: { top: 15, right: 15, bottom: 25, left: 55 }
  });
  chartYield = new LightweightCanvasChart('chartYieldAccumulation', {
    padding: { top: 10, right: 10, bottom: 20, left: 45 }
  });
  chartVelocity = new LightweightCanvasChart('chartVelocityCapital', {
    padding: { top: 10, right: 10, bottom: 20, left: 45 }
  });
}

function updateChartsWithHistory(history) {
  if (!history || history.length === 0) return;

  // Chart 1: Three-Tier Liquidity Rotation
  if (chartLiquidity) {
    chartLiquidity.renderMultiLine([
      { key: 'stablecoin_vol', color: '#f43f5e', width: 2, label: 'Stablecoins' },
      { key: 'deposit_vol', color: '#38bdf8', width: 2, label: 'Deposits' },
      { key: 'mmf_vol', color: '#fbbf24', width: 2, label: 'Tokenized MMF' },
      { key: 'cbdc_vol', color: '#10b981', width: 2, label: 'Wholesale CBDC' }
    ]);
  }

  // Chart 2: Programmable Yield Accumulation
  if (chartYield) {
    chartYield.renderMultiLine([
      { key: 'total_yield', color: '#10b981', width: 2.5, fill: 'rgba(16, 185, 129, 0.15)' }
    ]);
  }

  // Chart 3: Velocity vs Conserved Capital
  if (chartVelocity) {
    chartVelocity.renderMultiLine([
      { key: 'cum_volume', color: '#a855f7', width: 2, label: 'Processed Vol' },
      { key: 'total_sys_wealth', color: '#64748b', width: 1.5, dashed: true, label: 'Capital' }
    ]);
  }
}
