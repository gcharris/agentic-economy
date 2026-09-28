# 🎮 ANTIGRAVITY AGENT INSTRUCTION PROMPT: Token Town (The Sims of Digital Finance)

> **Instructions for Antigravity Agent:** 
> You are an expert Python game developer and financial mechanics designer. Your goal is to build an intuitive, interactive, visual "Sims-style" simulation game in Python called **Token Town**. 
>
> The game translates complex institutional digital finance concepts (interoperability, programmability, three-tier cash settlement, and closed-loop velocity) into an engaging, visual game that anyone can understand and play.

---

## 📖 Background & Core Concepts

This game is grounded in the institutional digital finance principles from *"The Connective Tissue of Digital Finance"*:
1. **Three-Tier Cash Leg:** Money exists as (a) Spending Stablecoins, (b) Tokenized Bank Deposits, and (c) Base-layer Settlement Vaults.
2. **Programmability:** Payments auto-split on contact—splitting operational costs, automated savings, and transaction fees in real-time.
3. **Interoperability:** Instant 24/7 cross-ledger transfers between town districts via "bridge couriers".
4. **Closed-Loop Velocity:** Money stays inside the system, moving rapidly to maximize liquidity efficiency.

---

## 🎯 Game Specification: "Token Town"

### 1. The Characters (Agents)
* **Bob the Baker 🥖:** Produces digital bread. Needs energy and flour to keep his oven running.
* **Sally the Shopper 🛒:** Earns coins working at the library and buys bread when hungry.
* **Penny the Piggy Bank 🤖🐷:** Bob's automated treasurer. Automatically sweeps any balance over 20 coins into high-yield savings.
* **Flash the Skater 🛹:** The cross-ledger bridge courier that routes payments between the Town Center and the Island Market 24/7.

### 2. Core Game Loop & Mechanics
* **Interactive Controls:** The user can manually trigger actions or let the simulation run automatically:
  * `[1]` **Buy Bread:** Sally pays 10 coins → Smart coin auto-splits: 8 to Bob, 1.5 to Penny (Savings), 0.5 to Flash (Bridge Fee).
  * `[2]` **Trigger Energy Spike:** Increases operational costs, testing if Penny's yield sweeps can keep Bob solvent.
  * `[3]` **Bridge Island Flour:** Flash moves tokens across ledgers instantly using ISO-standard messages.
  * `[4]` **Toggle Auto-Run:** Watch the town economy run at 1 turn per second.

### 3. User Interface (Pick one based on environment)
* **Option A (Rich Visual Terminal UI):** Uses Python's `rich` library to draw colorful ASCII cards, live balance bars, transaction logs, and a velocity speedometer.
* **Option B (Pygame / Streamlit GUI):** A clean, visual dashboard showing animated sprites or nodes moving money across town.

---

## 🛠️ Requirements for Code Generation

1. Write a complete, standalone Python script `token_town_game.py`.
2. Include zero external dependencies beyond standard library or `rich` / `pygame` / `matplotlib` (handle missing libraries gracefully with fallbacks).
3. Add a friendly main menu and easy keyboard controls so a non-technical user can immediately play.
4. Provide fun visual feedback (ASCII art or graphs) after every transaction showing:
   * Real-time money velocity meter.
   * Auto-split distribution breakdowns.
   * Agent balances and happiness/energy meters.

---

## 🚀 Desired Output
Generate `token_town_game.py` with clean code, helpful comments, and an instant-start game loop.
