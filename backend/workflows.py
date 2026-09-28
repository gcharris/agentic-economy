"""
Layer 3: Multi-Asset Programmable Workflows Engine
Grounded in: "The Connective Tissue of Digital Finance"
"""

import random
from typing import Dict, List, Any, Optional, Tuple
from .models import Agent, AgentRole, AssetType, LedgerZone, SimulationConfig
from .bridge import InteroperabilityBridge


class WorkflowEngine:
    def __init__(self, config: SimulationConfig):
        self.config = config

    def execute_atomic_dvp(self, agents: Dict[str, Agent], step: int) -> Optional[Dict[str, Any]]:
        """
        WORKFLOW A: Atomic Delivery versus Payment (DvP) Split Settlement.
        Replaces batch T+1/T+2 clearing with instant atomic multi-split payment:
        80% Producer, 15% Treasury Liquidity Reserve, 5% CSD Collateral Vault.
        """
        consumers = [a for a in agents.values() if a.role == AgentRole.CONSUMER and a.get_balance(AssetType.GENIUS_STABLECOIN) > 20.0]
        producers = [a for a in agents.values() if a.role == AgentRole.COMPUTE_PRODUCER]
        treasurers = [a for a in agents.values() if a.role == AgentRole.CORPORATE_TREASURER]
        custodians = [a for a in agents.values() if a.role == AgentRole.CUSTODIAN_CSD]

        if not (consumers and producers and treasurers and custodians):
            return None

        # 60% probability of a consumer transaction this cycle
        if random.random() > 0.65:
            return None

        consumer = random.choice(consumers)
        producer = random.choice(producers)
        treasurer = random.choice(treasurers)
        custodian = random.choice(custodians)

        payment_amt = round(random.uniform(35.0, 140.0), 2)
        if not consumer.deduct_balance(AssetType.GENIUS_STABLECOIN, payment_amt):
            return None

        # Calculate splits
        p_share = round(payment_amt * self.config.dvp_producer_split, 2)
        t_share = round(payment_amt * self.config.dvp_treasury_split, 2)
        c_share = round(payment_amt * self.config.dvp_csd_split, 2)

        # Distribute into appropriate asset tiers
        producer.add_balance(AssetType.TOKENIZED_DEPOSIT, p_share)
        treasurer.add_balance(AssetType.TOKENIZED_DEPOSIT, t_share)
        custodian.add_balance(AssetType.WHOLESALE_CBDC, c_share)

        collateral_unlocked = round(c_share * self.config.collateral_multiplier, 2)

        return {
            "step": step,
            "workflow_type": "ATOMIC_DVP_SPLIT",
            "title": "Atomic DvP Multi-Split Payment",
            "consumer_id": consumer.agent_id,
            "producer_id": producer.agent_id,
            "treasurer_id": treasurer.agent_id,
            "custodian_id": custodian.agent_id,
            "total_amount": payment_amt,
            "producer_share": p_share,
            "treasury_share": t_share,
            "csd_share": c_share,
            "collateral_unlocked": collateral_unlocked,
            "description": f"Consumer {consumer.name} purchased cloud compute. Atomic split routed: ${p_share:.2f} to {producer.name}, ${t_share:.2f} liquidity fee to {treasurer.name}, ${c_share:.2f} to CSD Vault unlocking ${collateral_unlocked:.2f} collateral."
        }

    def execute_treasurer_sweeps(self, agents: Dict[str, Agent], step: int) -> List[Dict[str, Any]]:
        """
        WORKFLOW B: Automated Treasury MMF Sweeps & Programmable Yield Accumulation.
        Automatically sweeps non-yielding stablecoins into yield-bearing Tokenized MMFs.
        """
        events = []
        treasurers = [a for a in agents.values() if a.role == AgentRole.CORPORATE_TREASURER]

        for treasurer in treasurers:
            stable_bal = treasurer.get_balance(AssetType.GENIUS_STABLECOIN)
            if stable_bal > self.config.treasurer_sweep_threshold:
                sweep_amt = round(stable_bal - self.config.treasurer_sweep_buffer, 2)
                if sweep_amt > 10.0 and treasurer.deduct_balance(AssetType.GENIUS_STABLECOIN, sweep_amt):
                    treasurer.add_balance(AssetType.TOKENIZED_MMF, sweep_amt)
                    events.append({
                        "step": step,
                        "workflow_type": "PROGRAMMABLE_MMF_SWEEP",
                        "title": "Automated Treasury MMF Sweep",
                        "agent_id": treasurer.agent_id,
                        "agent_name": treasurer.name,
                        "amount": sweep_amt,
                        "description": f"{treasurer.name} triggered auto-sweep: ${sweep_amt:.2f} moved from non-yielding GENIUS Stablecoins into Tokenized MMF."
                    })

            # Calculate programmable daily yield on MMF balances
            mmf_bal = treasurer.get_balance(AssetType.TOKENIZED_MMF)
            if mmf_bal > 0:
                daily_yield = round(mmf_bal * self.config.mmf_yield_rate, 4)
                treasurer.add_balance(AssetType.TOKENIZED_MMF, daily_yield)
                treasurer.yield_earned = round(treasurer.yield_earned + daily_yield, 4)

        return events

    def execute_arbitrage_swap(self, agents: Dict[str, Agent], bridge: InteroperabilityBridge, step: int) -> Optional[Dict[str, Any]]:
        """
        WORKFLOW C: Interoperability Arbitrage & Cross-Ledger Swift Balancing.
        Arbitrageurs balance liquidity between Bazaar Public DEX and Citadel Private Bank.
        """
        arbitrageurs = [a for a in agents.values() if a.role == AgentRole.ARBITRAGEUR and a.get_balance(AssetType.GENIUS_STABLECOIN) >= 150.0]
        treasurers = [a for a in agents.values() if a.role == AgentRole.CORPORATE_TREASURER]

        if not (arbitrageurs and treasurers):
            return None

        if random.random() > 0.40:
            return None

        arb = random.choice(arbitrageurs)
        treasurer = random.choice(treasurers)
        swap_amt = round(random.uniform(100.0, 300.0), 2)

        if arb.deduct_balance(AssetType.GENIUS_STABLECOIN, swap_amt):
            msg = bridge.dispatch_payment(
                sender=arb.agent_id,
                receiver=treasurer.agent_id,
                amount=swap_amt,
                asset_type=AssetType.TOKENIZED_DEPOSIT,
                src=LedgerZone.BAZAAR_PUBLIC_DEX,
                dst=LedgerZone.CITADEL_PRIVATE_BANK,
                step_number=step
            )
            return {
                "step": step,
                "workflow_type": "CROSS_LEDGER_ARBITRAGE",
                "title": "Cross-Ledger ISO 20022 Arbitrage Dispatched",
                "agent_id": arb.agent_id,
                "receiver_id": treasurer.agent_id,
                "amount": swap_amt,
                "msg_id": msg.msg_id,
                "source_ledger": LedgerZone.BAZAAR_PUBLIC_DEX.value,
                "target_ledger": LedgerZone.CITADEL_PRIVATE_BANK.value,
                "description": f"Arbitrageur {arb.name} dispatched ISO 20022 pacs.008 transfer of ${swap_amt:.2f} from Public DEX to Private Bank."
            }
        return None
