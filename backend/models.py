"""
Data Models for Institutional Digital Finance Simulation Engine
Grounded in: "The Connective Tissue of Digital Finance"
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import time
import random
import uuid


class AssetType(str, Enum):
    GENIUS_STABLECOIN = "GENIUS_Stablecoin"  # Non-yielding, high velocity payment rail
    TOKENIZED_DEPOSIT = "Tokenized_Deposit"  # Yield-bearing, 24/7 bank liability
    WHOLESALE_CBDC = "Wholesale_CBDC"        # Core central bank base-layer asset
    TOKENIZED_MMF = "Tokenized_MMF"          # Yield-bearing money market fund asset
    DIGITAL_BOND = "Digital_Bond"            # Tokenized security collateral


class LedgerZone(str, Enum):
    CITADEL_PRIVATE_BANK = "Citadel_Private_Bank"
    BAZAAR_PUBLIC_DEX = "Bazaar_Public_DEX"
    CORE_CBDC_SETTLEMENT = "Core_CBDC_Settlement"
    DTCC_APPCHAIN = "DTCC_Collateral_AppChain"


class AgentRole(str, Enum):
    CORPORATE_TREASURER = "Corporate_Treasurer"
    COMPUTE_PRODUCER = "Compute_Producer"
    ARBITRAGEUR = "Interop_Arbitrageur"
    CONSUMER = "Citizen_Consumer"
    CUSTODIAN_CSD = "Custodian_CSD"


@dataclass
class ISO20022Message:
    msg_id: str
    message_type: str  # pacs.008, pacs.009, camt.053
    sender: str
    receiver: str
    amount: float
    asset_type: AssetType
    source_ledger: LedgerZone
    target_ledger: LedgerZone
    latency_cycles: int = 1
    initial_latency: int = 1
    status: str = "PENDING"  # PENDING, IN_TRANSIT, DELIVERED, FAILED
    error_reason: Optional[str] = None
    created_at_step: int = 0
    xml_payload: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "msg_id": self.msg_id,
            "message_type": self.message_type,
            "sender": self.sender,
            "receiver": self.receiver,
            "amount": round(self.amount, 2),
            "asset_type": self.asset_type.value,
            "source_ledger": self.source_ledger.value,
            "target_ledger": self.target_ledger.value,
            "latency_cycles": self.latency_cycles,
            "initial_latency": self.initial_latency,
            "status": self.status,
            "error_reason": self.error_reason,
            "created_at_step": self.created_at_step,
            "xml_payload": self.xml_payload
        }


@dataclass
class Agent:
    agent_id: str
    name: str
    role: AgentRole
    primary_ledger: LedgerZone
    balances: Dict[AssetType, float] = field(default_factory=dict)
    yield_earned: float = 0.0
    transactions_count: int = 0

    def get_balance(self, asset: AssetType) -> float:
        return self.balances.get(asset, 0.0)

    def add_balance(self, asset: AssetType, amount: float):
        self.balances[asset] = round(self.get_balance(asset) + amount, 4)
        self.transactions_count += 1

    def deduct_balance(self, asset: AssetType, amount: float) -> bool:
        if self.get_balance(asset) >= amount:
            self.balances[asset] = round(self.balances[asset] - amount, 4)
            self.transactions_count += 1
            return True
        return False

    def total_wealth(self) -> float:
        return round(sum(self.balances.values()), 2)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "role": self.role.value,
            "primary_ledger": self.primary_ledger.value,
            "balances": {k.value: round(v, 2) for k, v in self.balances.items()},
            "yield_earned": round(self.yield_earned, 2),
            "total_wealth": self.total_wealth(),
            "transactions_count": self.transactions_count
        }


@dataclass
class SimulationConfig:
    bridge_latency: int = 2
    failure_rate: float = 0.02
    mmf_yield_rate: float = 0.045 / 365  # ~4.5% annual
    treasurer_sweep_threshold: float = 1000.0
    treasurer_sweep_buffer: float = 500.0
    dvp_producer_split: float = 0.80
    dvp_treasury_split: float = 0.15
    dvp_csd_split: float = 0.05
    collateral_multiplier: float = 1.5

    def to_dict(self) -> Dict[str, Any]:
        return {
            "bridge_latency": self.bridge_latency,
            "failure_rate": self.failure_rate,
            "mmf_yield_rate": self.mmf_yield_rate,
            "annual_yield_percent": round(self.mmf_yield_rate * 365 * 100, 2),
            "treasurer_sweep_threshold": self.treasurer_sweep_threshold,
            "treasurer_sweep_buffer": self.treasurer_sweep_buffer,
            "dvp_producer_split": self.dvp_producer_split,
            "dvp_treasury_split": self.dvp_treasury_split,
            "dvp_csd_split": self.dvp_csd_split,
            "collateral_multiplier": self.collateral_multiplier
        }
