"""
Institutional Digital Finance Closed-Loop Sandbox (v2.0)
========================================================
A multi-agent, 4-layer simulation modeling the interplay between:
1. Three-Tier Cash Settlement (Wholesale CBDC, Tokenized Bank Deposits, GENIUS Stablecoins)
2. Interoperability Routing (ISO 20022 Swift Messaging, DTCC Collateral AppChain)
3. Multi-Asset Programmable Workflows (Atomic DvP, Automated MMF Sweeps, FX Swaps)
4. Autonomous Institutional Agents (Corporate Treasurers, Arbitrageurs, Custodians, Producers)

Grounding Source: "The Connective Tissue of Digital Finance"
"""

import sys
import os
import json
import random
import time
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd


# ---------------------------------------------------------------------------
# LAYER 1: THREE-TIER CASH & ASSET DEFINITIONS
# ---------------------------------------------------------------------------

class AssetType(Enum):
    GENIUS_STABLECOIN = "GENIUS_Stablecoin"  # Non-yield, high velocity payment rail
    TOKENIZED_DEPOSIT = "Tokenized_Deposit"  # Yield-bearing, 24/7 bank liability
    WHOLESALE_CBDC = "Wholesale_CBDC"        # Core central bank base-layer asset
    TOKENIZED_MMF = "Tokenized_MMF"          # Yield-bearing money market fund asset
    DIGITAL_BOND = "Digital_Bond"            # Tokenized security collateral


class LedgerZone(Enum):
    CITADEL_PRIVATE_BANK = "Citadel_Private_Bank"
    BAZAAR_PUBLIC_DEX = "Bazaar_Public_DEX"
    CORE_CBDC_SETTLEMENT = "Core_CBDC_Settlement"
    DTCC_APPCHAIN = "DTCC_Collateral_AppChain"


# ---------------------------------------------------------------------------
# LAYER 2: INTEROPERABILITY & MESSAGING RAILS
# ---------------------------------------------------------------------------

@dataclass
class ISO20022Message:
    msg_id: str
    sender: str
    receiver: str
    amount: float
    asset_type: AssetType
    source_ledger: LedgerZone
    target_ledger: LedgerZone
    latency_cycles: int = 1
    status: str = "PENDING"  # PENDING, IN_TRANSIT, DELIVERED, FAILED


class InteroperabilityBridge:
    def __init__(self, base_latency: int = 1, failure_rate: float = 0.02):
        self.base_latency = base_latency
        self.failure_rate = failure_rate
        self.message_queue: List[ISO20022Message] = []
        self.processed_messages: List[ISO20022Message] = []

    def dispatch_payment(self, sender: str, receiver: str, amount: float,
                         asset_type: AssetType, src: LedgerZone, dst: LedgerZone) -> ISO20022Message:
        msg = ISO20022Message(
            msg_id=f"pacs.008.{int(time.time() * 1000)}.{random.randint(1000, 9999)}",
            sender=sender,
            receiver=receiver,
            amount=amount,
            asset_type=asset_type,
            source_ledger=src,
            target_ledger=dst,
            latency_cycles=self.base_latency + (1 if src != dst else 0)
        )
        self.message_queue.append(msg)
        return msg

    def tick(self) -> List[ISO20022Message]:
        delivered = []
        for msg in list(self.message_queue):
            msg.latency_cycles -= 1
            if msg.latency_cycles <= 0:
                if random.random() < self.failure_rate:
                    msg.status = "FAILED"
                    self.message_queue.remove(msg)
                    self.processed_messages.append(msg)
                else:
                    msg.status = "DELIVERED"
                    self.message_queue.remove(msg)
                    self.processed_messages.append(msg)
                    delivered.append(msg)
            else:
                msg.status = "IN_TRANSIT"
        return delivered


# ---------------------------------------------------------------------------
# LAYER 4: INSTITUTIONAL AGENTS
# ---------------------------------------------------------------------------

class AgentRole(Enum):
    CORPORATE_TREASURER = "Corporate_Treasurer"
    COMPUTE_PRODUCER = "Compute_Producer"
    ARBITRAGEUR = "Interop_Arbitrageur"
    CONSUMER = "Citizen_Consumer"
    CUSTODIAN_CSD = "Custodian_CSD"


@dataclass
class Agent:
    agent_id: str
    role: AgentRole
    primary_ledger: LedgerZone
    balances: Dict[AssetType, float] = field(default_factory=dict)
    yield_earned: float = 0.0

    def get_balance(self, asset: AssetType) -> float:
        return self.balances.get(asset, 0.0)

    def add_balance(self, asset: AssetType, amount: float):
        self.balances[asset] = self.get_balance(asset) + amount

    def deduct_balance(self, asset: AssetType, amount: float) -> bool:
        if self.get_balance(asset) >= amount:
            self.balances[asset] -= amount
            return True
        return False


# ---------------------------------------------------------------------------
# LAYER 3: MULTI-ASSET PROGRAMMABLE WORKFLOW ENGINE
# ---------------------------------------------------------------------------

class ClosedLoopEconomySimulation:
    def __init__(self, num_agents: int = 24, mmf_yield_rate: float = 0.045 / 365, bridge_latency: int = 1):
        self.mmf_yield_rate = mmf_yield_rate
        self.bridge = InteroperabilityBridge(base_latency=bridge_latency)
        self.agents: Dict[str, Agent] = {}
        self.ledger_totals: Dict[LedgerZone, float] = {l: 0.0 for l in LedgerZone}
        self.history: List[Dict[str, Any]] = []
        self.transactions: List[Dict[str, Any]] = []
        self.total_volume = 0.0
        self.collateral_unlocked = 0.0

        self._initialize_agents(num_agents)

    def _initialize_agents(self, num_agents: int):
        roles = [
            (AgentRole.CORPORATE_TREASURER, LedgerZone.CITADEL_PRIVATE_BANK, 4),
            (AgentRole.COMPUTE_PRODUCER, LedgerZone.CITADEL_PRIVATE_BANK, 4),
            (AgentRole.ARBITRAGEUR, LedgerZone.BAZAAR_PUBLIC_DEX, 4),
            (AgentRole.CONSUMER, LedgerZone.BAZAAR_PUBLIC_DEX, 8),
            (AgentRole.CUSTODIAN_CSD, LedgerZone.CORE_CBDC_SETTLEMENT, 4),
        ]

        agent_counter = 0
        for role, ledger, count in roles:
            for i in range(count):
                agent_id = f"{role.value}_{i+1}"
                agent = Agent(agent_id=agent_id, role=role, primary_ledger=ledger)

                # Seed initial balances based on tier
                if role == AgentRole.CORPORATE_TREASURER:
                    agent.add_balance(AssetType.TOKENIZED_DEPOSIT, 15000.0)
                    agent.add_balance(AssetType.GENIUS_STABLECOIN, 2000.0)
                elif role == AgentRole.COMPUTE_PRODUCER:
                    agent.add_balance(AssetType.TOKENIZED_DEPOSIT, 5000.0)
                    agent.add_balance(AssetType.DIGITAL_BOND, 10000.0)
                elif role == AgentRole.ARBITRAGEUR:
                    agent.add_balance(AssetType.GENIUS_STABLECOIN, 8000.0)
                    agent.add_balance(AssetType.TOKENIZED_DEPOSIT, 8000.0)
                elif role == AgentRole.CONSUMER:
                    agent.add_balance(AssetType.GENIUS_STABLECOIN, 1200.0)
                elif role == AgentRole.CUSTODIAN_CSD:
                    agent.add_balance(AssetType.WHOLESALE_CBDC, 50000.0)

                self.agents[agent_id] = agent
                agent_counter += 1

    def step(self, step_number: int):
        # 1. Process pending bridge transactions
        delivered_messages = self.bridge.tick()
        for msg in delivered_messages:
            receiver = self.agents.get(msg.receiver)
            if receiver:
                receiver.add_balance(msg.asset_type, msg.amount)
                self.transactions.append({
                    "step": step_number,
                    "type": "BRIDGE_DELIVERY",
                    "from": msg.sender,
                    "to": msg.receiver,
                    "amount": msg.amount,
                    "asset": msg.asset_type.value,
                    "msg_id": msg.msg_id
                })

        # 2. Execute Autonomous Agent Behaviored Workflows
        for agent in self.agents.values():

            # WORKFLOW A: Corporate Treasurer Automated MMF Sweep
            if agent.role == AgentRole.CORPORATE_TREASURER:
                # Sweep excess non-yield stablecoins into Tokenized MMF
                stable_bal = agent.get_balance(AssetType.GENIUS_STABLECOIN)
                if stable_bal > 1000.0:
                    sweep_amt = stable_bal - 500.0  # Keep 500 buffer
                    agent.deduct_balance(AssetType.GENIUS_STABLECOIN, sweep_amt)
                    agent.add_balance(AssetType.TOKENIZED_MMF, sweep_amt)
                    self.total_volume += sweep_amt
                    self.transactions.append({
                        "step": step_number,
                        "type": "PROGRAMMABLE_MMF_SWEEP",
                        "from": agent.agent_id,
                        "to": agent.agent_id,
                        "amount": sweep_amt,
                        "asset": AssetType.TOKENIZED_MMF.value
                    })

                # Accumulate MMF yield
                mmf_bal = agent.get_balance(AssetType.TOKENIZED_MMF)
                if mmf_bal > 0:
                    yield_amt = mmf_bal * self.mmf_yield_rate
                    agent.add_balance(AssetType.TOKENIZED_MMF, yield_amt)
                    agent.yield_earned += yield_amt

            # WORKFLOW B: Consumer Purchasing via Atomic DvP
            elif agent.role == AgentRole.CONSUMER:
                if random.random() < 0.6:  # 60% chance to purchase
                    target_producer = random.choice([
                        a for a in self.agents.values() if a.role == AgentRole.COMPUTE_PRODUCER
                    ])
                    cost = random.uniform(30.0, 120.0)

                    if agent.deduct_balance(AssetType.GENIUS_STABLECOIN, cost):
                        # Smart Contract Split: 80% Producer, 15% Treasurer Liquidity, 5% Collateral Vault
                        p_share = cost * 0.80
                        t_share = cost * 0.15
                        c_share = cost * 0.05

                        target_producer.add_balance(AssetType.TOKENIZED_DEPOSIT, p_share)

                        treasurer = random.choice([
                            a for a in self.agents.values() if a.role == AgentRole.CORPORATE_TREASURER
                        ])
                        treasurer.add_balance(AssetType.TOKENIZED_DEPOSIT, t_share)

                        custodian = random.choice([
                            a for a in self.agents.values() if a.role == AgentRole.CUSTODIAN_CSD
                        ])
                        custodian.add_balance(AssetType.WHOLESALE_CBDC, c_share)

                        self.collateral_unlocked += c_share * 1.5  # Collateral efficiency multiplier
                        self.total_volume += cost

                        self.transactions.append({
                            "step": step_number,
                            "type": "ATOMIC_DVP_SPLIT",
                            "from": agent.agent_id,
                            "to": target_producer.agent_id,
                            "amount": cost,
                            "asset": AssetType.GENIUS_STABLECOIN.value
                        })

            # WORKFLOW C: Arbitrageur Cross-Ledger Balancing
            elif agent.role == AgentRole.ARBITRAGEUR:
                if random.random() < 0.4:
                    # Dispatch cross-ledger bridge payment
                    src_asset = AssetType.GENIUS_STABLECOIN
                    if agent.deduct_balance(src_asset, 200.0):
                        target_agent = random.choice([
                            a for a in self.agents.values() if a.role == AgentRole.CORPORATE_TREASURER
                        ])
                        self.bridge.dispatch_payment(
                            sender=agent.agent_id,
                            receiver=target_agent.agent_id,
                            amount=200.0,
                            asset_type=AssetType.TOKENIZED_DEPOSIT,
                            src=LedgerZone.BAZAAR_PUBLIC_DEX,
                            dst=LedgerZone.CITADEL_PRIVATE_BANK
                        )
                        self.total_volume += 200.0

        # Record step state
        self._record_metrics(step_number)

    def _record_metrics(self, step_number: int):
        total_sys_wealth = sum(
            sum(a.balances.values()) for a in self.agents.values()
        )
        stablecoin_vol = sum(
            a.get_balance(AssetType.GENIUS_STABLECOIN) for a in self.agents.values()
        )
        deposit_vol = sum(
            a.get_balance(AssetType.TOKENIZED_DEPOSIT) for a in self.agents.values()
        )
        mmf_vol = sum(
            a.get_balance(AssetType.TOKENIZED_MMF) for a in self.agents.values()
        )
        cbdc_vol = sum(
            a.get_balance(AssetType.WHOLESALE_CBDC) for a in self.agents.values()
        )
        total_yield = sum(a.yield_earned for a in self.agents.values())

        self.history.append({
            "step": step_number,
            "total_sys_wealth": total_sys_wealth,
            "stablecoin_vol": stablecoin_vol,
            "deposit_vol": deposit_vol,
            "mmf_vol": mmf_vol,
            "cbdc_vol": cbdc_vol,
            "total_yield": total_yield,
            "cum_volume": self.total_volume,
            "collateral_unlocked": self.collateral_unlocked
        })

    def run(self, steps: int = 100) -> pd.DataFrame:
        for s in range(1, steps + 1):
            self.step(s)
        return pd.DataFrame(self.history)


# ---------------------------------------------------------------------------
# VISUALIZATION & EXPORT SUITE
# ---------------------------------------------------------------------------

def generate_dashboard(df: pd.DataFrame, output_path: str):
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle("Institutional Digital Finance Sandbox (v2.0) - Simulation Metrics", fontsize=16, fontweight='bold')

    # Chart 1: Cash Asset Rotation (Three-Tier Cash Leg)
    axes[0, 0].plot(df["step"], df["stablecoin_vol"], label="GENIUS Stablecoins (Payment)", color="#FF6B6B", linewidth=2)
    axes[0, 0].plot(df["step"], df["deposit_vol"], label="Tokenized Deposits (Bank)", color="#4ECDC4", linewidth=2)
    axes[0, 0].plot(df["step"], df["mmf_vol"], label="Tokenized MMF (Yield)", color="#FFE66D", linewidth=2)
    axes[0, 0].plot(df["step"], df["cbdc_vol"], label="Wholesale CBDC (Base)", color="#1A535C", linewidth=2)
    axes[0, 0].set_title("Three-Tier Cash Asset Asset Liquidity Rotation")
    axes[0, 0].set_xlabel("Simulation Cycle (Time)")
    axes[0, 0].set_ylabel("Volume ($)")
    axes[0, 0].legend()
    axes[0, 0].grid(True, linestyle="--", alpha=0.5)

    # Chart 2: Cumulative Automated Yield Generation
    axes[0, 1].plot(df["step"], df["total_yield"], color="#2ECC71", linewidth=2.5)
    axes[0, 1].set_title("Programmable Yield Accumulation (MMF Sweeps)")
    axes[0, 1].set_xlabel("Simulation Cycle")
    axes[0, 1].set_ylabel("Yield Earned ($)")
    axes[0, 1].grid(True, linestyle="--", alpha=0.5)

    # Chart 3: Velocity of Money vs Total Wealth
    axes[1, 0].plot(df["step"], df["cum_volume"], label="Cumulative Settlement Volume", color="#9B59B6", linewidth=2)
    axes[1, 0].plot(df["step"], df["total_sys_wealth"], label="Conserved System Capital", color="#34495E", linestyle="--")
    axes[1, 0].set_title("Capital Conservation vs Payment Velocity")
    axes[1, 0].set_xlabel("Simulation Cycle")
    axes[1, 0].set_ylabel("Amount ($)")
    axes[1, 0].legend()
    axes[1, 0].grid(True, linestyle="--", alpha=0.5)

    # Chart 4: Collateral Efficiency Unlocked
    axes[1, 1].fill_between(df["step"], df["collateral_unlocked"], color="#3498DB", alpha=0.4)
    axes[1, 1].plot(df["step"], df["collateral_unlocked"], color="#2980B9", linewidth=2)
    axes[1, 1].set_title("DTCC Collateral AppChain Mobility Unlock ($)")
    axes[1, 1].set_xlabel("Simulation Cycle")
    axes[1, 1].set_ylabel("Unlocked Buffer ($)")
    axes[1, 1].grid(True, linestyle="--", alpha=0.5)

    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    plt.savefig(output_path, dpi=200)
    plt.close()


def main():
    print("Initializing Upgraded Institutional Sandbox v2.0...")
    sim = ClosedLoopEconomySimulation(num_agents=24, bridge_latency=2)
    df = sim.run(steps=120)

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    os.makedirs(output_dir, exist_ok=True)

    # Save outputs
    results_csv = os.path.join(output_dir, "simulation_results_v2.csv")
    df.to_csv(results_csv, index=False)
    
    dashboard_png = os.path.join(output_dir, "closed_loop_sim_dashboard_v2.png")
    generate_dashboard(df, dashboard_png)

    # Generate summary JSON
    summary = {
        "simulation_version": "2.0",
        "steps_completed": len(df),
        "total_agents": len(sim.agents),
        "total_volume_processed": sim.total_volume,
        "total_yield_generated": float(df["total_yield"].iloc[-1]),
        "collateral_unlocked": sim.collateral_unlocked,
        "processed_iso_messages": len(sim.bridge.processed_messages),
        "velocity_multiplier": round(sim.total_volume / df["total_sys_wealth"].iloc[-1], 2)
    }

    summary_json = os.path.join(output_dir, "simulation_summary_v2.json")
    with open(summary_json, "w") as f:
        json.dump(summary, f, indent=2)

    print("\n=== Simulation Complete ===")
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
