# Institutional Digital Finance Closed-Loop Sandbox (v2.0)

A multi-agent, closed-loop economic simulation platform for testing **interoperability, programmability, and three-tier digital cash assets** in institutional finance.

Grounded in the report: *"The Connective Tissue of Digital Finance"*

---

## 🏗️ Architecture Overview

The simulation models a 4-layer institutional financial stack:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     LAYER 4: INSTITUTIONAL AGENTS                       │
│  Corporate Treasurers  │  FX Arbitrageurs  │  CSD / Custody Nodes       │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│              LAYER 3: MULTI-ASSET PROGRAMMABLE WORKFLOWS                │
│   Atomic DvP Settlement  │  Automated MMF Sweeps  │  Digital FX Swaps   │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│                 LAYER 2: INTEROPERABILITY ROUTING                       │
│    ISO 20022 Messaging Rail (Swift)  │  Collateral AppChain (DTCC)   │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
┌─────────────────────────────────────────────────────────────────────────┐
│                  LAYER 1: THREE-TIER CASH SETTLEMENT                    │
│   Wholesale CBDC (Base)  │  Tokenized Deposits  │  GENIUS Stablecoins   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started in Antigravity / IDE

### Prerequisites
* Python 3.9+
* Required packages: `matplotlib`, `pandas`

Install dependencies:
```bash
pip install matplotlib pandas
```

### Running the Interactive Real-Time Web Control Room (v2.1)

Start the full-stack simulation server (FastAPI + WebSockets + Interactive Dashboard):
```bash
.venv/bin/python run_server.py
```
Then navigate to: **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.

Features included in the Web Control Room:
* **Interactive Macro HUD**: Live conserved wealth, settlement volume, velocity multiplier, and DTCC collateral unlock metrics.
* **Three-Tier Cash Asset Rotation Charts**: Real-time Canvas charts tracking liquidity movements between GENIUS Stablecoins, Tokenized Deposits, Tokenized MMFs, and Wholesale CBDCs.
* **Interoperability Radar & Packet Flow**: Animated visual topology mapping messages across Citadel Private Bank, Bazaar Public DEX, Core CBDC Settlement, and DTCC AppChain.
* **ISO 20022 Audit Log & XML Inspector**: Direct modal inspection of raw `pacs.008.001.10` credit transfer payloads with standard financial headers and tokenization metadata.
* **24 Institutional Agent Fleet**: Real-time balance sheets and yield tracking for Corporate Treasurers, Compute Producers, Interop Arbitrageurs, Consumers, and Custodians.
* **Dynamic Sliders & Scenario Regimes**: Live adjustment of bridge latency, failure rates, MMF yield rates, sweep thresholds, and DvP split ratios.

---

### Running the Headless Batch Prototype

Execute the original batch script with `.venv`:
```bash
.venv/bin/python 01-closed_loop_economy_sandbox_v2.py
```

---

## 📊 Output Artifacts

Running the script automatically produces:

1. **`closed_loop_economy_sandbox_v2.py`**: Main simulation source code.
2. **`closed_loop_sim_dashboard_v2.png`**: High-resolution 4-panel visual dashboard displaying:
   * **Three-Tier Cash Asset Rotation** (Stablecoins vs. Tokenized Deposits vs. MMFs vs. Wholesale CBDCs).
   * **Programmable Yield Accumulation** from automated treasurer sweeps.
   * **Payment Velocity vs. Conserved Capital**.
   * **Collateral Efficiency Buffer Unlocked** via DTCC AppChain mobility.
3. **`simulation_results_v2.csv`**: Time-series log of step-by-step liquidity balances across all layers.
4. **`simulation_summary_v2.json`**: Aggregate execution metrics and transaction statistics.

---

## 🧠 Tested Economic & Technological Mechanics

* **Three-Tier Settlement Dynamics**: Non-yielding GENIUS stablecoins act as payment rails, while excess liquidity is automatically swept into yield-bearing Tokenized Deposits & MMFs.
* **ISO 20022 Messaging Latency**: Injects simulated bridge network delays and packet failure retries across private bank and public DEX ledgers.
* **Smart Contract Payment Splitting**: Purchases automatically execute atomic 3-way split payments (Producer revenue, Treasury reserve, Custodian collateral vault) instantly on-chain without batch settlement windows.
* **Collateral Mobility**: Real-time collateral lockups automatically unlock excess capital buffers based on DTCC AppChain metrics.
