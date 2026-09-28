"""
Simulation Engine orchestrating 24 Institutional Agents, Interoperability Rails,
and Programmable Multi-Asset Workflows.
Grounded in: "The Connective Tissue of Digital Finance"
"""

import random
from typing import Dict, List, Any, Optional
from .models import Agent, AgentRole, AssetType, LedgerZone, SimulationConfig, ISO20022Message
from .bridge import InteroperabilityBridge
from .workflows import WorkflowEngine


class SimulationEngine:
    def __init__(self, config: Optional[SimulationConfig] = None):
        self.config = config or SimulationConfig()
        self.bridge = InteroperabilityBridge(
            base_latency=self.config.bridge_latency,
            failure_rate=self.config.failure_rate
        )
        self.workflows = WorkflowEngine(self.config)
        self.agents: Dict[str, Agent] = {}
        self.history: List[Dict[str, Any]] = []
        self.recent_transactions: List[Dict[str, Any]] = []
        self.step_number: int = 0
        self.total_volume: float = 0.0
        self.collateral_unlocked: float = 0.0
        self.is_running: bool = False

        self._seed_agents()

    def _seed_agents(self):
        """Initializes 24 institutional agent nodes across 4 ledger zones."""
        self.agents.clear()
        
        # 1. Automated Treasurers / Piggy Banks (Citadel Private Bank)
        treasurer_names = [
            ("Penny the Piggy Bank 🤖🐷", "TREAS-01"),
            ("Marcus (Vault Warden)", "TREAS-02"),
            ("Vance (Liquidity Manager)", "TREAS-03"),
            ("Chloe (Coin Vault)", "TREAS-04")
        ]
        for name, aid in treasurer_names:
            agent = Agent(agent_id=aid, name=name, role=AgentRole.CORPORATE_TREASURER, primary_ledger=LedgerZone.CITADEL_PRIVATE_BANK)
            agent.add_balance(AssetType.TOKENIZED_DEPOSIT, 15000.0)
            agent.add_balance(AssetType.GENIUS_STABLECOIN, 2200.0)
            self.agents[aid] = agent

        # 2. Producers / Bakers (Citadel Private Bank)
        producer_names = [
            ("Bob the Baker 🥖", "PROD-01"),
            ("Helios (Energy Forge)", "PROD-02"),
            ("Quantum (Gadget Workshop)", "PROD-03"),
            ("Hyperion (Cyber Arcade)", "PROD-04")
        ]
        for name, aid in producer_names:
            agent = Agent(agent_id=aid, name=name, role=AgentRole.COMPUTE_PRODUCER, primary_ledger=LedgerZone.CITADEL_PRIVATE_BANK)
            agent.add_balance(AssetType.TOKENIZED_DEPOSIT, 5000.0)
            agent.add_balance(AssetType.DIGITAL_BOND, 10000.0)
            self.agents[aid] = agent

        # 3. Interoperability Couriers / Skaters (Bazaar Public DEX)
        arb_names = [
            ("Flash the Skater 🛹", "ARB-01"),
            ("Maya (Cross-Town Courier)", "ARB-02"),
            ("Pip (Swift Express)", "ARB-03"),
            ("Ash (Island Trader)", "ARB-04")
        ]
        for name, aid in arb_names:
            agent = Agent(agent_id=aid, name=name, role=AgentRole.ARBITRAGEUR, primary_ledger=LedgerZone.BAZAAR_PUBLIC_DEX)
            agent.add_balance(AssetType.GENIUS_STABLECOIN, 8000.0)
            agent.add_balance(AssetType.TOKENIZED_DEPOSIT, 8000.0)
            self.agents[aid] = agent

        # 4. Citizen Consumers / Shoppers (Bazaar Public DEX)
        consumer_names = [
            ("Sally the Shopper 🛒", "CONS-01"),
            ("Ben (Techie)", "CONS-02"),
            ("Carla (Student)", "CONS-03"),
            ("Dan (Gamer)", "CONS-04"),
            ("Elena (Music Producer)", "CONS-05"),
            ("Finn (Freelancer)", "CONS-06"),
            ("Grace (Architect)", "CONS-07"),
            ("Hugo (City Explorer)", "CONS-08")
        ]
        for name, aid in consumer_names:
            agent = Agent(agent_id=aid, name=name, role=AgentRole.CONSUMER, primary_ledger=LedgerZone.BAZAAR_PUBLIC_DEX)
            agent.add_balance(AssetType.GENIUS_STABLECOIN, 1500.0)
            self.agents[aid] = agent

        # 5. Custodians & Castle Keepers (Core CBDC Settlement)
        custodian_names = [
            ("Lord Arthur (Castle CSD Vault)", "CSD-01"),
            ("Duchess Helena (Grand Ledger)", "CSD-02"),
            ("Elder Silas (Reserve Fortress)", "CSD-03"),
            ("Lady Beatrice (Safety Shield)", "CSD-04")
        ]
        for name, aid in custodian_names:
            agent = Agent(agent_id=aid, name=name, role=AgentRole.CUSTODIAN_CSD, primary_ledger=LedgerZone.CORE_CBDC_SETTLEMENT)
            agent.add_balance(AssetType.WHOLESALE_CBDC, 50000.0)
            self.agents[aid] = agent

        # Record initial baseline step
        self._record_metrics(0)

    def step(self) -> Dict[str, Any]:
        """Advances the simulation by 1 discrete financial settlement cycle."""
        self.step_number += 1
        cycle_events = []

        # 1. Process pending bridge transactions & deliver across ledgers
        delivered_messages = self.bridge.tick()
        for msg in delivered_messages:
            receiver = self.agents.get(msg.receiver)
            if receiver:
                receiver.add_balance(msg.asset_type, msg.amount)
                event = {
                    "step": self.step_number,
                    "workflow_type": "BRIDGE_DELIVERY",
                    "title": "ISO 20022 Cross-Ledger Settlement Delivered",
                    "msg_id": msg.msg_id,
                    "sender": msg.sender,
                    "receiver": msg.receiver,
                    "receiver_name": receiver.name,
                    "amount": msg.amount,
                    "asset": msg.asset_type.value,
                    "description": f"Swift message {msg.msg_id} delivered ${msg.amount:.2f} {msg.asset_type.value} from {msg.source_ledger.value} to {msg.target_ledger.value}."
                }
                cycle_events.append(event)
                self.recent_transactions.insert(0, event)

        # 2. Execute Layer 3: Multi-Asset Programmable Workflows
        
        # A: Atomic DvP Payment Split
        dvp_event = self.workflows.execute_atomic_dvp(self.agents, self.step_number)
        if dvp_event:
            self.total_volume += dvp_event["total_amount"]
            self.collateral_unlocked += dvp_event["collateral_unlocked"]
            cycle_events.append(dvp_event)
            self.recent_transactions.insert(0, dvp_event)

        # B: Corporate Treasurer Automated MMF Sweeps & Yield
        sweep_events = self.workflows.execute_treasurer_sweeps(self.agents, self.step_number)
        for ev in sweep_events:
            self.total_volume += ev["amount"]
            cycle_events.append(ev)
            self.recent_transactions.insert(0, ev)

        # C: Arbitrageur Cross-Ledger Bridge Balancing
        arb_event = self.workflows.execute_arbitrage_swap(self.agents, self.bridge, self.step_number)
        if arb_event:
            self.total_volume += arb_event["amount"]
            cycle_events.append(arb_event)
            self.recent_transactions.insert(0, arb_event)

        # Keep recent transactions list capped
        if len(self.recent_transactions) > 100:
            self.recent_transactions = self.recent_transactions[:100]

        # Record metrics snapshot
        metrics = self._record_metrics(self.step_number)

        return {
            "step": self.step_number,
            "events": cycle_events,
            "metrics": metrics
        }

    def _record_metrics(self, step_num: int) -> Dict[str, Any]:
        """Calculates macro-economic metrics for this cycle."""
        total_sys_wealth = sum(a.total_wealth() for a in self.agents.values())
        stablecoin_vol = sum(a.get_balance(AssetType.GENIUS_STABLECOIN) for a in self.agents.values())
        deposit_vol = sum(a.get_balance(AssetType.TOKENIZED_DEPOSIT) for a in self.agents.values())
        mmf_vol = sum(a.get_balance(AssetType.TOKENIZED_MMF) for a in self.agents.values())
        cbdc_vol = sum(a.get_balance(AssetType.WHOLESALE_CBDC) for a in self.agents.values())
        bond_vol = sum(a.get_balance(AssetType.DIGITAL_BOND) for a in self.agents.values())
        total_yield = sum(a.yield_earned for a in self.agents.values())
        velocity = round(self.total_volume / total_sys_wealth if total_sys_wealth > 0 else 0.0, 3)

        # Ledger breakdown
        ledger_balances = {lz.value: 0.0 for lz in LedgerZone}
        for a in self.agents.values():
            ledger_balances[a.primary_ledger.value] += a.total_wealth()

        snapshot = {
            "step": step_num,
            "total_sys_wealth": round(total_sys_wealth, 2),
            "stablecoin_vol": round(stablecoin_vol, 2),
            "deposit_vol": round(deposit_vol, 2),
            "mmf_vol": round(mmf_vol, 2),
            "cbdc_vol": round(cbdc_vol, 2),
            "bond_vol": round(bond_vol, 2),
            "total_yield": round(total_yield, 2),
            "cum_volume": round(self.total_volume, 2),
            "collateral_unlocked": round(self.collateral_unlocked, 2),
            "velocity": velocity,
            "in_transit_messages_count": len(self.bridge.message_queue),
            "processed_messages_count": len(self.bridge.processed_messages),
            "ledger_balances": {k: round(v, 2) for k, v in ledger_balances.items()}
        }
        self.history.append(snapshot)
        return snapshot

    def get_state(self) -> Dict[str, Any]:
        """Full state payload for client rendering (supports both Sims mode and Institutional mode)."""
        current_metrics = self.history[-1] if self.history else {}
        
        # Calculate Sims Town Happiness (0 to 100)
        consumers = [a for a in self.agents.values() if a.role == AgentRole.CONSUMER]
        avg_consumer_cash = sum(c.get_balance(AssetType.GENIUS_STABLECOIN) for c in consumers) / len(consumers) if consumers else 0
        town_happiness = min(100, max(20, int((avg_consumer_cash / 1500.0) * 85 + (current_metrics.get("velocity", 0.1) * 60))))

        # Calculate Town Prosperity Stars (1 to 5)
        total_vol = current_metrics.get("cum_volume", 0)
        stars = 1
        if total_vol > 1000: stars = 2
        if total_vol > 5000: stars = 3
        if total_vol > 15000: stars = 4
        if total_vol > 35000: stars = 5

        # Human-readable thought bubbles for agents
        agent_list = []
        for a in self.agents.values():
            a_dict = a.to_dict()
            pocket = a.get_balance(AssetType.GENIUS_STABLECOIN)
            bank = a.get_balance(AssetType.TOKENIZED_DEPOSIT)
            piggy = a.get_balance(AssetType.TOKENIZED_MMF)
            
            thought = "Enjoying a quiet day in town."
            avatar = "🧑"
            if a.role == AgentRole.CONSUMER:
                avatar = "🛍️"
                if pocket > 1200:
                    thought = f"Got ${pocket:.0f} pocket cash! Heading to the Cyber Cafe for coffee ☕"
                elif pocket > 400:
                    thought = f"Browsing gadgets at the Bazaar with ${pocket:.0f} left 📱"
                else:
                    thought = "Running low on shopping coins, hoping Mayor drops a stimulus! 🪙"
            elif a.role == AgentRole.COMPUTE_PRODUCER:
                avatar = "💻"
                thought = f"Workshop is humming! Bank balance is ${bank:,.0f} ⚡"
            elif a.role == AgentRole.CORPORATE_TREASURER:
                avatar = "🏛️"
                if piggy > 0:
                    thought = f"Piggy Bank is growing! Earned +${a.yield_earned:.2f} interest today 🌾"
                else:
                    thought = f"Monitoring cash reserves (${bank:,.0f} in vaults) 🏦"
            elif a.role == AgentRole.ARBITRAGEUR:
                avatar = "🛵"
                thought = f"Zooming between the Market & Bank with ${pocket:,.0f} in hand! 📦"
            elif a.role == AgentRole.CUSTODIAN_CSD:
                avatar = "🏰"
                thought = "Castle Vault is impregnable. Collateral backing is 100% solid! 🛡️"

            a_dict["thought"] = thought
            a_dict["avatar"] = avatar
            agent_list.append(a_dict)

        return {
            "step": self.step_number,
            "is_running": self.is_running,
            "config": self.config.to_dict(),
            "metrics": current_metrics,
            "sims_meta": {
                "town_name": "Citadel Bay",
                "town_happiness": town_happiness,
                "prosperity_stars": stars,
                "time_of_day": ["Morning 🌅", "Afternoon ☀️", "Sunset 🌇", "Night 🌙"][self.step_number % 4],
                "active_citizens": len(self.agents)
            },
            "history": self.history[-60:],  # Last 60 steps for charts
            "in_transit_messages": self.bridge.get_in_transit_messages(),
            "recent_messages": self.bridge.get_recent_messages(20),
            "recent_transactions": self.recent_transactions[:25],
            "agents": agent_list,
            "bridge_stats": {
                "total_dispatched": self.bridge.total_dispatched,
                "total_delivered": self.bridge.total_delivered,
                "total_failed": self.bridge.total_failed,
                "current_queue": len(self.bridge.message_queue)
            }
        }

    # -----------------------------------------------------------------------
    # MAYOR GAME ACTIONS (Fun interactive buttons for the human player!)
    # -----------------------------------------------------------------------
    def mayor_drop_stimulus(self, amount: float = 100.0) -> Dict[str, Any]:
        """Mayor Power: Drop pocket cash to all 8 citizens to spur shopping!"""
        consumers = [a for a in self.agents.values() if a.role == AgentRole.CONSUMER]
        for c in consumers:
            c.add_balance(AssetType.GENIUS_STABLECOIN, amount)
        self.step_number += 1
        ev = {
            "step": self.step_number,
            "workflow_type": "MAYOR_STIMULUS",
            "title": "Mayor Stimulus Air Drop! 💸",
            "description": f"Mayor dropped ${amount:.0f} Pocket Cash to all {len(consumers)} town residents!"
        }
        self.recent_transactions.insert(0, ev)
        self._record_metrics(self.step_number)
        return ev

    def mayor_trigger_shopping_spree(self) -> List[Dict[str, Any]]:
        """Mayor Power: Everyone goes to the market and buys goods!"""
        events = []
        for _ in range(3):
            ev = self.workflows.execute_atomic_dvp(self.agents, self.step_number)
            if ev:
                self.total_volume += ev["total_amount"]
                self.collateral_unlocked += ev["collateral_unlocked"]
                ev["title"] = "🛍️ Shopping Spree: " + ev.get("title", "")
                events.append(ev)
                self.recent_transactions.insert(0, ev)
        self.step_number += 1
        self._record_metrics(self.step_number)
        return events

    def mayor_harvest_piggy_bank(self) -> List[Dict[str, Any]]:
        """Mayor Power: Force treasurers to sweep money into the Golden Piggy Bank!"""
        events = self.workflows.execute_treasurer_sweeps(self.agents, self.step_number)
        for ev in events:
            self.total_volume += ev["amount"]
            ev["title"] = "🌾 Golden Harvest: " + ev.get("title", "")
            self.recent_transactions.insert(0, ev)
        self.step_number += 1
        self._record_metrics(self.step_number)
        return events

    def mayor_dispatch_courier(self) -> Optional[Dict[str, Any]]:
        """Mayor Power: Send a fast armored courier cart between Market and Bank!"""
        ev = self.workflows.execute_arbitrage_swap(self.agents, self.bridge, self.step_number)
        if ev:
            self.total_volume += ev["amount"]
            ev["title"] = "🚚 Armored Courier Dispatched: " + ev.get("title", "")
            self.recent_transactions.insert(0, ev)
            self.step_number += 1
            self._record_metrics(self.step_number)
            return ev
        return None

    def update_config(self, updates: Dict[str, Any]):
        """Live updates from UI control panel."""
        if "bridge_latency" in updates:
            self.config.bridge_latency = int(updates["bridge_latency"])
            self.bridge.update_config(base_latency=self.config.bridge_latency)
        if "failure_rate" in updates:
            self.config.failure_rate = float(updates["failure_rate"])
            self.bridge.update_config(failure_rate=self.config.failure_rate)
        if "annual_yield_percent" in updates:
            annual = float(updates["annual_yield_percent"])
            self.config.mmf_yield_rate = (annual / 100.0) / 365.0
        if "treasurer_sweep_threshold" in updates:
            self.config.treasurer_sweep_threshold = float(updates["treasurer_sweep_threshold"])
        if "treasurer_sweep_buffer" in updates:
            self.config.treasurer_sweep_buffer = float(updates["treasurer_sweep_buffer"])
        if "dvp_producer_split" in updates:
            self.config.dvp_producer_split = float(updates["dvp_producer_split"])
        if "dvp_treasury_split" in updates:
            self.config.dvp_treasury_split = float(updates["dvp_treasury_split"])
        if "dvp_csd_split" in updates:
            self.config.dvp_csd_split = float(updates["dvp_csd_split"])
        if "collateral_multiplier" in updates:
            self.config.collateral_multiplier = float(updates["collateral_multiplier"])

    def load_scenario(self, scenario_name: str):
        """Loads preset financial market conditions."""
        if scenario_name == "baseline":
            self.update_config({
                "bridge_latency": 2,
                "failure_rate": 0.02,
                "annual_yield_percent": 4.5,
                "treasurer_sweep_threshold": 1000.0,
                "collateral_multiplier": 1.5
            })
        elif scenario_name == "high_yield_rush":
            self.update_config({
                "bridge_latency": 1,
                "failure_rate": 0.01,
                "annual_yield_percent": 9.5,
                "treasurer_sweep_threshold": 600.0,
                "collateral_multiplier": 2.0
            })
        elif scenario_name == "network_congestion":
            self.update_config({
                "bridge_latency": 5,
                "failure_rate": 0.12,
                "annual_yield_percent": 3.0,
                "treasurer_sweep_threshold": 1500.0,
                "collateral_multiplier": 1.0
            })
        elif scenario_name == "collateral_crisis":
            self.update_config({
                "bridge_latency": 4,
                "failure_rate": 0.08,
                "annual_yield_percent": 5.0,
                "dvp_csd_split": 0.15,
                "dvp_treasury_split": 0.10,
                "dvp_producer_split": 0.75,
                "collateral_multiplier": 3.0
            })

    def reset(self):
        """Resets simulation to initial state."""
        self.step_number = 0
        self.total_volume = 0.0
        self.collateral_unlocked = 0.0
        self.history.clear()
        self.recent_transactions.clear()
        self.bridge.reset()
        self._seed_agents()
