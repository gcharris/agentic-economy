/**
 * Citadel Bay: The Sims Living Economy & Institutional Sandbox (v2.1)
 * Frontend Controller & WebSocket Client
 */

let socket = null;
let currentSimulationState = null;
let currentFilter = 'ALL';
let currentAgentRoleFilter = 'ALL';
let isAutoPlaying = false;
let currentViewMode = 'sims'; // 'sims' or 'terminal'

// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initSimsGame();
  initCharts();
  initRadar();
  initEventListeners();
  initSimsInspectorListener();
  initAcademy();
  connectWebSocket();
});

// ---------------------------------------------------------------------------
// WEBSOCKET & STATE STREAMING
// ---------------------------------------------------------------------------
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  setConnectionStatus(false, 'Connecting...');

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setConnectionStatus(true, 'Town Live (60fps)');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INITIAL_STATE' || data.type === 'SIMULATION_UPDATE') {
          handleStateUpdate(data.state, data.latest_event);
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    socket.onclose = () => {
      setConnectionStatus(false, 'Reconnecting in 2s...');
      setTimeout(connectWebSocket, 2000);
    };

    socket.onerror = () => {
      setConnectionStatus(false, 'Offline');
    };
  } catch (err) {
    console.error('Failed to create WebSocket:', err);
    setConnectionStatus(false, 'Offline - Polling Fallback');
  }
}

function setConnectionStatus(isLive, text) {
  const ind = document.querySelector('.status-indicator');
  const txt = document.getElementById('connectionText');
  if (ind) {
    ind.className = `status-indicator ${isLive ? 'live' : 'offline'}`;
  }
  if (txt) {
    txt.textContent = text;
  }
}

// ---------------------------------------------------------------------------
// STATE DISPATCH & VIEW REFRESH
// ---------------------------------------------------------------------------
function handleStateUpdate(state, latestEvent) {
  if (!state) return;
  currentSimulationState = state;

  // 1. Update cycle counter
  const stepEl = document.getElementById('cycleStepVal');
  if (stepEl) stepEl.textContent = state.step;

  // 2. Play/Pause state button
  isAutoPlaying = !!state.is_running;
  const playIcon = document.getElementById('playPauseIcon');
  const playText = document.getElementById('playPauseText');
  if (playIcon && playText) {
    playIcon.textContent = isAutoPlaying ? '⏸' : '▶';
    playText.textContent = isAutoPlaying ? (currentViewMode === 'sims' ? 'Pause Town' : 'Pause') : (currentViewMode === 'sims' ? 'Play Town' : 'Run Auto');
  }

  const metrics = state.metrics || {};
  const simsMeta = state.sims_meta || {};

  // 3. Update SIMS TOWN MODE KPI Ribbon
  const simsWealth = document.getElementById('simsTotalWealth');
  if (simsWealth) simsWealth.textContent = formatCurrency(metrics.total_sys_wealth || 0);

  const simsTrade = document.getElementById('simsTradeVol');
  if (simsTrade) simsTrade.textContent = formatCurrency(metrics.cum_volume || 0);

  const simsYield = document.getElementById('simsYieldEarned');
  if (simsYield) simsYield.textContent = formatCurrency(metrics.total_yield || 0);

  const simsCollateral = document.getElementById('simsCollateral');
  if (simsCollateral) simsCollateral.textContent = formatCurrency(metrics.collateral_unlocked || 0);

  const simsHappiness = document.getElementById('simsHappinessScore');
  if (simsHappiness) simsHappiness.textContent = `${simsMeta.town_happiness || 85}% Happy`;

  const simsStars = document.getElementById('simsProsperity');
  if (simsStars) simsStars.textContent = "⭐".repeat(simsMeta.prosperity_stars || 4);

  // 4. Update Sims Canvas & Chronicles Feed
  updateSimsGame(state);
  renderSimsChronicles(state.recent_transactions);

  // 5. Update WALL STREET TERMINAL KPI Ribbon (if visible)
  const valWealth = document.getElementById('valTotalWealth');
  if (valWealth) valWealth.textContent = formatCurrency(metrics.total_sys_wealth || 0);

  const valVol = document.getElementById('valProcessedVol');
  if (valVol) valVol.textContent = formatCurrency(metrics.cum_volume || 0);

  const valVel = document.getElementById('valVelocity');
  if (valVel) valVel.textContent = `${(metrics.velocity || 0).toFixed(2)}x Velocity`;

  const valYield = document.getElementById('valYieldEarned');
  if (valYield) valYield.textContent = formatCurrency(metrics.total_yield || 0);

  const valYieldRate = document.getElementById('valYieldRate');
  if (valYieldRate) valYieldRate.textContent = `${state.config?.annual_yield_percent?.toFixed(2) || 4.5}% APR`;

  const valCollateral = document.getElementById('valCollateralUnlocked');
  if (valCollateral) valCollateral.textContent = formatCurrency(metrics.collateral_unlocked || 0);

  const valCollateralMult = document.getElementById('valCollateralMult');
  if (valCollateralMult) valCollateralMult.textContent = `${state.config?.collateral_multiplier || 1.5}x Mobility`;

  const bridgeStats = state.bridge_stats || {};
  const valMsgs = document.getElementById('valDeliveredMsgs');
  if (valMsgs) valMsgs.textContent = `${bridgeStats.total_delivered || 0} / ${bridgeStats.total_dispatched || 0}`;

  const valQueue = document.getElementById('valQueueCount');
  if (valQueue) valQueue.textContent = `${bridgeStats.current_queue || 0} In Transit`;

  // 6. Update Three-Tier Asset Liquidity Rotation Pills
  const pillStab = document.getElementById('pillStablecoinVal');
  if (pillStab) pillStab.textContent = formatCurrency(metrics.stablecoin_vol || 0);
  const pillDep = document.getElementById('pillDepositVal');
  if (pillDep) pillDep.textContent = formatCurrency(metrics.deposit_vol || 0);
  const pillMmf = document.getElementById('pillMMFVal');
  if (pillMmf) pillMmf.textContent = formatCurrency(metrics.mmf_vol || 0);
  const pillCbdc = document.getElementById('pillCBDCVal');
  if (pillCbdc) pillCbdc.textContent = formatCurrency(metrics.cbdc_vol || 0);

  // 7. Update Charts
  updateChartsWithHistory(state.history);

  // 8. Update 4 Ledger Zone Balances
  const ledgers = metrics.ledger_balances || {};
  const zCitadel = document.getElementById('zoneCitadelBal');
  if (zCitadel) zCitadel.textContent = formatCurrency(ledgers['Citadel_Private_Bank'] || 0);
  const zBazaar = document.getElementById('zoneBazaarBal');
  if (zBazaar) zBazaar.textContent = formatCurrency(ledgers['Bazaar_Public_DEX'] || 0);
  const zCore = document.getElementById('zoneCoreBal');
  if (zCore) zCore.textContent = formatCurrency(ledgers['Core_CBDC_Settlement'] || 0);
  const zDTCC = document.getElementById('zoneDTCCBal');
  if (zDTCC) zDTCC.textContent = `${formatCurrency(metrics.collateral_unlocked || 0)} Buffer`;

  // 9. Update Interoperability Radar
  updateRadar(state.in_transit_messages, ledgers);

  // 10. Update In-Transit List & Terminal Feeds
  renderInTransitQueue(state.in_transit_messages);
  renderWorkflowFeed(state.recent_transactions);
  renderAgentsGrid(state.agents);
  renderMessagesTable(state.recent_messages);
}

// ---------------------------------------------------------------------------
// SIMS TOWN CHRONICLES & INSPECTOR
// ---------------------------------------------------------------------------
function renderSimsChronicles(transactions) {
  const container = document.getElementById('simsFeedList');
  if (!container) return;

  if (!transactions || transactions.length === 0) {
    container.innerHTML = `<div class="feed-item"><div class="feed-body">The town is peacefully bustling. Click a Mayor button to stir up action!</div></div>`;
    return;
  }

  container.innerHTML = transactions.slice(0, 15).map(t => {
    let icon = "🛍️";
    let title = "Market Purchase";
    if (t.workflow_type === 'PROGRAMMABLE_MMF_SWEEP' || t.title?.includes('Harvest')) {
      icon = "🌾";
      title = "Piggy Bank Harvest";
    } else if (t.workflow_type === 'CROSS_LEDGER_ARBITRAGE' || t.title?.includes('Courier')) {
      icon = "🚚";
      title = "Armored Courier";
    } else if (t.workflow_type === 'MAYOR_STIMULUS') {
      icon = "💸";
      title = "Mayor Stimulus Rain!";
    }

    return `
      <div class="feed-item">
        <div class="feed-item-header">
          <span style="font-weight:700;font-size:11px;color:var(--accent-cyan);">${icon} ${title}</span>
          <span class="feed-time">Cycle #${t.step}</span>
        </div>
        <div class="feed-body" style="font-size:11px;">${escapeHtml(t.description || t.title)}</div>
      </div>
    `;
  }).join('');
}

function initSimsInspectorListener() {
  window.onSimsEntitySelected = (entity) => {
    if (!entity) return;

    const avatar = document.getElementById('inspectAvatar');
    const name = document.getElementById('inspectName');
    const role = document.getElementById('inspectRole');
    const thought = document.getElementById('inspectThought');
    const pocket = document.getElementById('inspectPocket');
    const bank = document.getElementById('inspectBank');
    const piggy = document.getElementById('inspectPiggy');
    const mood = document.getElementById('inspectMood');

    if (entity.type === 'citizen') {
      const c = entity.data;
      if (avatar) avatar.textContent = c.icon || "🧑";
      if (name) name.textContent = c.name;
      if (role) role.textContent = `${c.role} • Citadel Bay Resident`;
      if (thought) thought.textContent = `"${c.thought || 'Enjoying a fine day in the neighborhood!'}"`;
      if (pocket) pocket.textContent = formatCurrency(c.pocketMoney || 0);
      if (bank) bank.textContent = formatCurrency(c.bankMoney || 0);
      if (piggy) piggy.textContent = formatCurrency(c.piggyMoney || 0);
      if (mood) mood.textContent = (c.pocketMoney > 500) ? "Happy 😊" : "Frugal 🤔";
    } else if (entity.type === 'district') {
      const d = entity.data;
      if (avatar) avatar.textContent = d.icon;
      if (name) name.textContent = d.name;
      if (role) role.textContent = "Town District & Activity Hub";
      if (thought) thought.textContent = `"${d.sub} - Everything here circulates seamlessly within the closed loop."`;
      if (pocket) pocket.textContent = "Hub";
      if (bank) bank.textContent = "Active";
      if (piggy) piggy.textContent = "Secure";
      if (mood) mood.textContent = "Bustling 🏙️";
    }
  };
}

// ---------------------------------------------------------------------------
// VIEW RENDERERS (WALL STREET TERMINAL)
// ---------------------------------------------------------------------------
function renderWorkflowFeed(transactions) {
  const container = document.getElementById('workflowFeedList');
  if (!container) return;

  if (!transactions || transactions.length === 0) {
    container.innerHTML = `<div class="empty-state">Waiting for first transaction...</div>`;
    return;
  }

  const filtered = transactions.filter(t => {
    if (currentFilter === 'ALL') return true;
    return t.workflow_type === currentFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No transactions found for filter "${currentFilter}".</div>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 25).map(t => {
    let badgeClass = 'type-dvp';
    let badgeLabel = 'DvP SPLIT';
    if (t.workflow_type === 'PROGRAMMABLE_MMF_SWEEP') {
      badgeClass = 'type-sweep';
      badgeLabel = 'MMF SWEEP';
    } else if (t.workflow_type === 'CROSS_LEDGER_ARBITRAGE') {
      badgeClass = 'type-arb';
      badgeLabel = 'SWIFT ARB';
    } else if (t.workflow_type === 'BRIDGE_DELIVERY') {
      badgeClass = 'type-bridge';
      badgeLabel = 'DELIVERED';
    } else if (t.workflow_type === 'MAYOR_STIMULUS') {
      badgeClass = 'type-sweep';
      badgeLabel = 'STIMULUS';
    }

    return `
      <div class="feed-item">
        <div class="feed-item-header">
          <span class="feed-type-badge ${badgeClass}">${badgeLabel}</span>
          <span class="feed-time">Cycle #${t.step}</span>
        </div>
        <div class="feed-body">${escapeHtml(t.description || t.title)}</div>
      </div>
    `;
  }).join('');
}

function renderInTransitQueue(messages) {
  const container = document.getElementById('inTransitList');
  const countEl = document.getElementById('inTransitCount');
  if (countEl) countEl.textContent = messages ? messages.length : 0;
  if (!container) return;

  if (!messages || messages.length === 0) {
    container.innerHTML = `<div class="empty-state">No Swift messages in flight. Cross-ledger bridge queues clear!</div>`;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const pct = Math.max(5, Math.min(100, Math.round(((msg.initial_latency - msg.latency_cycles) / msg.initial_latency) * 100)));
    return `
      <div class="in-transit-card" onclick="openMessageDetail('${msg.msg_id}')">
        <div class="transit-header">
          <span class="transit-id">${msg.msg_id}</span>
          <span class="transit-cycles">${msg.latency_cycles} cycle${msg.latency_cycles > 1 ? 's' : ''} left</span>
        </div>
        <div class="transit-body">
          <strong>$${msg.amount.toFixed(2)}</strong> (${msg.asset_type}) from ${msg.source_ledger.replace('_', ' ')} to ${msg.target_ledger.replace('_', ' ')}
        </div>
        <div class="transit-progress-bar">
          <div class="transit-progress-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAgentsGrid(agents) {
  const container = document.getElementById('agentsGrid');
  if (!container || !agents) return;

  const filtered = agents.filter(a => {
    if (currentAgentRoleFilter === 'ALL') return true;
    return a.role === currentAgentRoleFilter;
  });

  container.innerHTML = filtered.map(a => {
    const balances = a.balances || {};
    return `
      <div class="agent-card">
        <div class="agent-card-header">
          <div>
            <div class="agent-name">${a.avatar || '🧑'} ${escapeHtml(a.name)}</div>
            <span class="agent-ledger-badge">${a.primary_ledger.replace(/_/g, ' ')}</span>
          </div>
          <span class="agent-id-badge">${a.agent_id}</span>
        </div>

        <div class="agent-wealth-row">
          <span class="meta-k">Total Wealth</span>
          <span class="agent-wealth-val">${formatCurrency(a.total_wealth)}</span>
        </div>

        <div class="agent-balances-breakdown">
          ${balances['GENIUS_Stablecoin'] ? `<div class="balance-item"><span>Stablecoin:</span><span>${formatCurrency(balances['GENIUS_Stablecoin'])}</span></div>` : ''}
          ${balances['Tokenized_Deposit'] ? `<div class="balance-item"><span>Deposit:</span><span>${formatCurrency(balances['Tokenized_Deposit'])}</span></div>` : ''}
          ${balances['Tokenized_MMF'] ? `<div class="balance-item"><span>Tokenized MMF:</span><span>${formatCurrency(balances['Tokenized_MMF'])}</span></div>` : ''}
          ${balances['Wholesale_CBDC'] ? `<div class="balance-item"><span>Wholesale CBDC:</span><span>${formatCurrency(balances['Wholesale_CBDC'])}</span></div>` : ''}
          ${balances['Digital_Bond'] ? `<div class="balance-item"><span>Digital Bond:</span><span>${formatCurrency(balances['Digital_Bond'])}</span></div>` : ''}
          ${a.yield_earned > 0 ? `<div class="balance-item" style="color:var(--accent-emerald);"><span>Yield:</span><span>+${formatCurrency(a.yield_earned)}</span></div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderMessagesTable(messages) {
  const tbody = document.getElementById('messagesTableBody');
  if (!tbody || !messages) return;

  if (messages.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No ISO 20022 message audit logs recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = messages.map(m => {
    return `
      <tr>
        <td style="font-family:var(--font-mono);font-size:10px;color:var(--accent-cyan);">${m.msg_id}</td>
        <td><span class="modal-badge">${m.message_type || 'pacs.008'}</span></td>
        <td>${m.sender}</td>
        <td>${m.receiver}</td>
        <td style="font-family:var(--font-mono);font-weight:600;">$${m.amount.toFixed(2)}</td>
        <td>${m.asset_type.replace('_', ' ')}</td>
        <td style="font-size:10px;">${m.source_ledger.split('_')[0]} → ${m.target_ledger.split('_')[0]}</td>
        <td>${m.latency_cycles}</td>
        <td><span class="status-badge ${m.status}">${m.status}</span></td>
        <td>
          <button class="inspect-btn" onclick="openMessageDetail('${m.msg_id}')">Inspect XML</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ---------------------------------------------------------------------------
// ISO 20022 MODAL INSPECTOR
// ---------------------------------------------------------------------------
async function openMessageDetail(msgId) {
  const modal = document.getElementById('xmlModalOverlay');
  const codeEl = document.getElementById('modalXmlCode');
  const msgIdEl = document.getElementById('modalMsgId');
  const metaGrid = document.getElementById('modalMetadataGrid');

  modal.classList.add('open');
  msgIdEl.textContent = msgId;
  codeEl.textContent = 'Fetching ISO 20022 payload...';

  try {
    const res = await fetch(`/api/message/${msgId}`);
    if (!res.ok) throw new Error('Message not found');
    const msg = await res.json();

    metaGrid.innerHTML = `
      <div class="meta-box"><span class="meta-k">SENDER BIC</span><span class="meta-v">${msg.source_ledger.slice(0, 8).toUpperCase()}XXX</span></div>
      <div class="meta-box"><span class="meta-k">RECEIVER BIC</span><span class="meta-v">${msg.target_ledger.slice(0, 8).toUpperCase()}XXX</span></div>
      <div class="meta-box"><span class="meta-k">SETTLEMENT AMT</span><span class="meta-v">$${msg.amount.toFixed(2)} USD</span></div>
      <div class="meta-box"><span class="meta-k">STATUS</span><span class="status-badge ${msg.status}">${msg.status}</span></div>
    `;

    codeEl.textContent = msg.xml_payload || 'No XML payload generated for this message.';
  } catch (err) {
    codeEl.textContent = `Error: ${err.message}`;
  }
}

// ---------------------------------------------------------------------------
// EVENT LISTENERS & MAYOR CONTROLS
// ---------------------------------------------------------------------------
function initEventListeners() {
  // 1. View Mode Switcher
  const btnModeSims = document.getElementById('btnModeSims');
  const btnModeTerminal = document.getElementById('btnModeTerminal');
  const simsContainer = document.getElementById('simsModeContainer');
  const terminalContainer = document.getElementById('terminalModeContainer');
  const mainTitle = document.getElementById('pageMainTitle');
  const subTitle = document.getElementById('pageSubTitle');
  const brandTag = document.getElementById('brandTag');

  btnModeSims?.addEventListener('click', () => {
    currentViewMode = 'sims';
    btnModeSims.classList.add('active');
    btnModeTerminal.classList.remove('active');
    simsContainer.classList.add('active');
    terminalContainer.classList.remove('active');

    if (mainTitle) mainTitle.textContent = "🏡 Citadel Bay: The Sims Living Economy";
    if (subTitle) subTitle.textContent = "Watch little citizens live, shop, earn, and save in a 100% closed-loop virtual town!";
    if (brandTag) brandTag.textContent = "CITADEL BAY • LIVING TOWN";
  });

  btnModeTerminal?.addEventListener('click', () => {
    currentViewMode = 'terminal';
    btnModeTerminal.classList.add('active');
    btnModeSims.classList.remove('active');
    terminalContainer.classList.add('active');
    simsContainer.classList.remove('active');

    if (mainTitle) mainTitle.textContent = "Institutional Multi-Asset Workflows & Interoperability Rail";
    if (subTitle) subTitle.textContent = "Grounded in: The Connective Tissue of Digital Finance";
    if (brandTag) brandTag.textContent = "INSTITUTIONAL SANDBOX v2.1";
  });

  // 2. Mayor Game Action Buttons
  document.getElementById('btnMayorStimulus')?.addEventListener('click', async () => {
    await fetch('/api/mayor/stimulus', { method: 'POST' });
  });

  document.getElementById('btnMayorShopping')?.addEventListener('click', async () => {
    await fetch('/api/mayor/shopping-spree', { method: 'POST' });
  });

  document.getElementById('btnMayorHarvest')?.addEventListener('click', async () => {
    await fetch('/api/mayor/harvest', { method: 'POST' });
  });

  document.getElementById('btnMayorCourier')?.addEventListener('click', async () => {
    await fetch('/api/mayor/courier', { method: 'POST' });
  });

  // 3. Global Simulation Execution Controls
  document.getElementById('btnPlayPause')?.addEventListener('click', async () => {
    const endpoint = isAutoPlaying ? '/api/pause' : '/api/play?speed=0.9';
    await fetch(endpoint, { method: 'POST' });
  });

  document.getElementById('btnStep')?.addEventListener('click', async () => {
    await fetch('/api/step', { method: 'POST' });
  });

  document.getElementById('btnFastForward')?.addEventListener('click', async () => {
    await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: 10 })
    });
  });

  document.getElementById('btnReset')?.addEventListener('click', async () => {
    if (confirm('Reset the entire town economy?')) {
      await fetch('/api/reset', { method: 'POST' });
    }
  });

  // 4. Institutional Navigation Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // 5. Workflow Feed Filters
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      if (currentSimulationState) {
        renderWorkflowFeed(currentSimulationState.recent_transactions);
      }
    });
  });

  // 6. Agent Role Filters
  document.querySelectorAll('.role-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.role-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAgentRoleFilter = btn.dataset.role;
      if (currentSimulationState) {
        renderAgentsGrid(currentSimulationState.agents);
      }
    });
  });

  // 7. Scenario Buttons
  document.querySelectorAll('.scenario-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scenario = btn.dataset.scenario;
      await fetch(`/api/scenario/${scenario}`, { method: 'POST' });
    });
  });

  // 8. Sliders Linking
  linkSliderDisplay('inputBridgeLatency', 'valBridgeLatencyDisplay', v => `${v} cycle${v > 1 ? 's' : ''}`);
  linkSliderDisplay('inputFailureRate', 'valFailureRateDisplay', v => `${parseFloat(v).toFixed(1)}%`);
  linkSliderDisplay('inputAnnualYield', 'valAnnualYieldDisplay', v => `${parseFloat(v).toFixed(2)}%`);
  linkSliderDisplay('inputSweepThreshold', 'valSweepThresholdDisplay', v => `$${Number(v).toLocaleString()}`);
  linkSliderDisplay('inputProducerSplit', 'valProducerSplitDisplay', v => `${v}%`);
  linkSliderDisplay('inputTreasurySplit', 'valTreasurySplitDisplay', v => `${v}%`);

  // 9. Apply Config
  document.getElementById('btnApplyConfig')?.addEventListener('click', async () => {
    const configUpdate = {
      bridge_latency: parseInt(document.getElementById('inputBridgeLatency').value),
      failure_rate: parseFloat(document.getElementById('inputFailureRate').value) / 100.0,
      annual_yield_percent: parseFloat(document.getElementById('inputAnnualYield').value),
      treasurer_sweep_threshold: parseFloat(document.getElementById('inputSweepThreshold').value),
      dvp_producer_split: parseFloat(document.getElementById('inputProducerSplit').value) / 100.0,
      dvp_treasury_split: parseFloat(document.getElementById('inputTreasurySplit').value) / 100.0
    };

    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configUpdate)
    });
    alert('Parameters updated successfully!');
  });

  // 10. Modal Close & Copy
  document.getElementById('modalCloseBtn')?.addEventListener('click', () => {
    document.getElementById('xmlModalOverlay')?.classList.remove('open');
  });

  document.getElementById('xmlModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'xmlModalOverlay') {
      document.getElementById('xmlModalOverlay')?.classList.remove('open');
    }
  });

  document.getElementById('btnCopyXml')?.addEventListener('click', () => {
    const code = document.getElementById('modalXmlCode')?.textContent;
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btnCopyXml');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = orig, 1500);
      });
    }
  });
}

function linkSliderDisplay(inputId, displayId, formatter) {
  const input = document.getElementById(inputId);
  const display = document.getElementById(displayId);
  if (!input || !display) return;
  input.addEventListener('input', () => {
    display.textContent = formatter(input.value);
  });
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val || 0);
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// 🎓 DIGITAL FINANCE ACADEMY (5 LESSONS GROUNDED IN THE REPORT)
// ---------------------------------------------------------------------------
const LESSONS_DATA = {
  "1": {
    title: "Lesson 1: The Broken Telephone (Interoperability)",
    quote: "\"The bottleneck wasn't technology or innovation. It was interoperability... The moment individual networks agreed to connect through a shared, universal routing layer, the entire industry unlocked its potential.\"",
    realWorld: "Over $100B was invested in blockchains, but created isolated walled gardens. Swift's live shared ledger (July 2026, 17 global banks) uses ISO 20022 messaging to connect private bank networks and public chains.",
    townExplanation: "Bob's bakery is on the mainland and the flour mill is on the island. Without Flash the Skater, trade stops! Flash represents the shared Swift routing layer connecting both sides 24/7.",
    techTag: "Swift ISO 20022 pacs.008 Shared Ledger",
    simulateAction: async () => {
      await fetch('/api/mayor/courier', { method: 'POST' });
    }
  },
  "2": {
    title: "Lesson 2: The Saturday Night Crisis (24/7 Continuous Settlement)",
    quote: "\"A multinational managing liquidity across 20 markets holds cash in traditional accounts that cannot be mobilized until Monday morning if a margin call arises on Saturday... With tokenized deposits, money moves when needed, not when markets open.\"",
    realWorld: "Citi Token Services connects 300+ financial institutions across 50+ markets for 24/7 USD Clearing, eliminating legacy weekend cutoffs.",
    townExplanation: "When an energy spike hits Bob on Saturday night, traditional bank clearing is closed! Tokenized 24/7 deposits settle instantly, preventing Bob's ovens from shutting down.",
    techTag: "Citi Token Services 24/7 USD Clearing",
    simulateAction: async () => {
      await fetch('/api/step', { method: 'POST' });
    }
  },
  "3": {
    title: "Lesson 3: The Idle Money Leak (GENIUS Act & Three-Tier Cash)",
    quote: "\"The GENIUS Act (July 2025) clarified that stablecoins are bearer payment rails and barred interest-bearing structures... Idle on-chain money rotates into yield-bearing tokenized funds and deposits instead of sitting parked in stablecoins.\"",
    realWorld: "Digital money needs three co-existing tiers: (1) Fast Stablecoins for payment velocity, (2) Regulated Tokenized Bank Deposits for commercial credit & yield, and (3) Wholesale CBDCs as the risk-free base layer.",
    townExplanation: "Sally pays with stablecoins (Pocket Cash) because they are fast. But Bob can't leave cash idle earning 0%! Penny the Piggy Bank automatically sweeps balances over $1,000 into an 8% yield vault.",
    techTag: "Tokenized Money Market Funds (MMFs) & Sweeps",
    simulateAction: async () => {
      await fetch('/api/mayor/harvest', { method: 'POST' });
    }
  },
  "4": {
    title: "Lesson 4: Vanishing Invoices (Programmable DvP Settlement)",
    quote: "\"Programmability allows treasury policy to be embedded directly into the instrument... payments release upon verified delivery confirmation without manual instruction, reducing reconciliation complexity.\"",
    realWorld: "Atomic Delivery-versus-Payment (DvP) settles the security leg and cash leg simultaneously, eliminating settlement risk and cutting trillions in post-trade reconciliation.",
    townExplanation: "When Sally buys bread for 10 coins, there is no invoice, no 3-week payment delay, and no manual bookkeeping. The Smart Coin splits on delivery: 80% to Bob, 15% to Penny savings, 5% to the Castle Vault.",
    techTag: "Atomic Delivery vs Payment (DvP) Smart Contracts",
    simulateAction: async () => {
      await fetch('/api/mayor/shopping-spree', { method: 'POST' });
    }
  },
  "5": {
    title: "Lesson 5: Freeing the $36B Trapped Vault (Collateral Mobility)",
    quote: "\"Tokenization could release $4.8 billion from the approximately $36.8 billion of excess collateral held by tier-one institutions... DTCC's Collateral AppChain enables near real-time collateral mobility across custodians and blockchain networks.\"",
    realWorld: "DTCC's tokenization service and Collateral AppChain allow high-quality liquid assets (Treasuries, bonds) to move in seconds rather than days, unlocking billions in trapped liquidity.",
    townExplanation: "The Royal Castle Vault doesn't hoard useless gold; it issues collateral mobility certificates that let the town trade safely with a smaller safety cushion.",
    techTag: "DTCC Collateral AppChain on Besu / Canton",
    simulateAction: async () => {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collateral_multiplier: 2.5 })
      });
      await fetch('/api/mayor/shopping-spree', { method: 'POST' });
    }
  }
};

let currentLessonId = "1";

function initAcademy() {
  const quoteEl = document.getElementById('lessonQuote');
  const realWorldEl = document.getElementById('lessonRealWorld');
  const townExplEl = document.getElementById('lessonTownExplanation');
  const techTagEl = document.getElementById('lessonTechTag');
  const btnSimulate = document.getElementById('btnSimulateLesson');

  function renderLesson(id) {
    currentLessonId = id;
    const lesson = LESSONS_DATA[id];
    if (!lesson) return;

    if (quoteEl) quoteEl.textContent = lesson.quote;
    if (realWorldEl) realWorldEl.textContent = lesson.realWorld;
    if (townExplEl) townExplEl.textContent = lesson.townExplanation;
    if (techTagEl) techTagEl.textContent = lesson.techTag;

    document.querySelectorAll('.lesson-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lesson === id);
    });
  }

  document.querySelectorAll('.lesson-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      renderLesson(btn.dataset.lesson);
    });
  });

  btnSimulate?.addEventListener('click', async () => {
    const lesson = LESSONS_DATA[currentLessonId];
    if (lesson && lesson.simulateAction) {
      btnSimulate.textContent = 'Simulating... ⚡';
      await lesson.simulateAction();
      setTimeout(() => {
        btnSimulate.innerHTML = '<span class="btn-icon">⚡</span> Simulate This Lesson Live!';
      }, 1000);
    }
  });

  renderLesson("1");
}

