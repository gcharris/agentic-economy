"""
=============================================================================
AEL KERNEL: PHYSICAL AND ECONOMIC SUBSTRATE
=============================================================================
Location: /Users/gch2021/Dev/Multi-Asset Workflows/backend/ael/kernel.py
Authority: LABORATORY.md

Core Axioms:
  1. The base particle is the burn: Joules of energy, FLOPs, context tokens,
     cache state, and wall-clock latency.
  2. The human principal sits outside the loop: sets the goal, allocates
     the initial runway, reviews the receipt, and alone holds the permission
     to spend, send, or close.
  3. Reading, drafting, and auditing execute without asking. Any spend, external
     send, or irreversible close waits at the Spend Door.
  4. Waiting at the door incurs zero idle burn. State is preserved locally.
  5. Runway exhaustion triggers a clean halt and logs a structured receipt.
     Agents are staff; they are never deleted.
=============================================================================
"""

import json
import time
from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple


class ActionType(str, Enum):
    LOOKUP = "lookup"        # Read / Survey / Ingest (No door wait)
    DRAFT = "draft"          # Local synthesis / generation (No door wait)
    AUDIT = "audit"          # Verification / inspection (No door wait)
    SPEND = "spend"          # Capital spend / fee payment (GATED at Door)
    SEND = "send"            # Outbound message / network dispatch (GATED at Door)
    CLOSE = "close"          # Irreversible commit / work completion (GATED at Door)


class ModelTier(str, Enum):
    FAST_QUANTIZED = "fast_quantized"     # Low burn, fast, moderate epistemic drift
    BALANCED_STAFF = "balanced_staff"     # Standard production tier
    FRONTIER_DEEP = "frontier_deep"       # High burn, deep reasoning, minimal drift


@dataclass
class ResourceUnit:
    """Represents the multi-dimensional burn of a single inference turn."""
    tokens: int
    joules: float
    flops: float
    latency_ms: float
    cache_hit: bool = False

    @property
    def compute_credits(self) -> float:
        """Normalized accounting credit (1 credit ~= 10 tokens ~= 0.05 Joules)."""
        base = self.tokens / 10.0
        if self.cache_hit:
            base *= 0.15  # 85% discount on cached context
        return round(base, 2)


@dataclass
class ExecutionReceipt:
    """Receipt printed when work completes or halts."""
    task_id: str
    action_type: ActionType
    actor_id: str
    model_tier: ModelTier
    cost: ResourceUnit
    epistemic_confidence: float
    status: str
    saved_state_file: str = "local_saved_state.json"
    timestamp: float = field(default_factory=time.time)

    def to_plain_line(self) -> str:
        return (
            f"[{self.status.upper()}] Task: {self.task_id} | Actor: {self.actor_id} | "
            f"Burned: {self.cost.compute_credits:.1f} cr ({self.cost.joules:.2f}J, {self.cost.tokens} tok) | "
            f"Confidence: {self.epistemic_confidence:.1%} | State: {self.saved_state_file}"
        )


class EpistemicTracker:
    """
    Tracks ground truth degradation across multi-agent chains.
    When agent B consumes agent A's synthetic output without grounding,
    epistemic drift accumulates. Querying ground truth resets drift.
    """
    def __init__(self, initial_confidence: float = 1.0):
        self.confidence: float = initial_confidence
        self.generation: int = 0
        self.ground_truth_calibrations: int = 0

    def record_handover(self, model_tier: ModelTier, rigor: float = 0.85) -> float:
        """Records an agent-to-agent handover. Lower tiers drift faster."""
        self.generation += 1
        tier_stability = {
            ModelTier.FAST_QUANTIZED: 0.90,
            ModelTier.BALANCED_STAFF: 0.96,
            ModelTier.FRONTIER_DEEP: 0.99
        }[model_tier]

        # Drift decay formula: Confidence decays compounded by tier and synthesis rigor
        decay = (1.0 - tier_stability) * (1.0 - (rigor * 0.5))
        self.confidence = max(0.05, self.confidence * (1.0 - decay))
        return round(self.confidence, 4)

    def calibrate_with_ground_truth(self) -> float:
        """Paid oracle query to ground truth resets confidence to 1.0."""
        self.ground_truth_calibrations += 1
        self.confidence = 1.0
        return self.confidence


class SpendDoor:
    """
    The immutable boundary between open inspection and irreversible action.
    - Lookups, drafts, audits pass freely.
    - Spends, sends, and closes wait for explicit external permission.
    - Holding time burns ZERO idle compute. State remains intact.
    """
    def __init__(self, default_allowed: bool = False):
        self.allowed: bool = default_allowed
        self.blocked_attempts: int = 0
        self.allowed_executions: int = 0
        self.idle_burn_wh: float = 0.0  # Proves zero leakage

    def is_gated(self, action: ActionType) -> bool:
        return action in (ActionType.SPEND, ActionType.SEND, ActionType.CLOSE)

    def check_permission(self, action: ActionType) -> bool:
        if not self.is_gated(action):
            return True
        if self.allowed:
            self.allowed_executions += 1
            return True
        self.blocked_attempts += 1
        return False

    def park(self, state: Dict[str, Any], filepath: str = "local_saved_state.json") -> None:
        """Parks state safely to local JSON without leaking compute."""
        with open(filepath, "w") as f:
            json.dump(state, f, indent=2)


class RunwayPool:
    """
    Remaining compute budget. Decrements per burn.
    When depleted, triggers a clean halt without deleting staff.
    """
    def __init__(self, initial_credits: float = 1000.0, initial_joules: float = 5000.0):
        self.initial_credits = initial_credits
        self.remaining_credits = initial_credits
        self.initial_joules = initial_joules
        self.remaining_joules = initial_joules
        self.total_burned_credits = 0.0
        self.total_burned_joules = 0.0
        self.halted: bool = False
        self.halt_reason: Optional[str] = None
        self.history: List[ExecutionReceipt] = []

    def can_burn(self, cost: ResourceUnit) -> bool:
        credits_needed = cost.compute_credits
        return self.remaining_credits >= credits_needed and self.remaining_joules >= cost.joules

    def burn(self, receipt: ExecutionReceipt) -> bool:
        cost = receipt.cost
        if not self.can_burn(cost):
            self.halted = True
            self.halt_reason = f"Runway exhausted on {receipt.task_id}"
            receipt.status = "halted (runway exhausted)"
            self.history.append(receipt)
            return False

        self.remaining_credits -= cost.compute_credits
        self.remaining_joules -= cost.joules
        self.total_burned_credits += cost.compute_credits
        self.total_burned_joules += cost.joules
        self.history.append(receipt)
        return True

    def reclaim(self, unused_credits: float) -> None:
        """Penny's role: sweeps unspent allocation back to available runway. Zero yield."""
        self.remaining_credits += unused_credits


class InferenceKernel:
    """
    The compute engine (Bob's Oven) that converts intent into work products
    and calculates accurate energetic burn based on real model parameters.
    """
    TIER_SPECS = {
        ModelTier.FAST_QUANTIZED: {"joules_per_tok": 0.002, "flops_per_tok": 1.4e10, "ms_per_tok": 0.8},
        ModelTier.BALANCED_STAFF: {"joules_per_tok": 0.008, "flops_per_tok": 1.4e11, "ms_per_tok": 2.2},
        ModelTier.FRONTIER_DEEP:  {"joules_per_tok": 0.035, "flops_per_tok": 8.0e11, "ms_per_tok": 6.5},
    }

    @classmethod
    def calculate_burn(cls, model_tier: ModelTier, token_count: int, cache_hit: bool = False) -> ResourceUnit:
        specs = cls.TIER_SPECS[model_tier]
        effective_tokens = int(token_count * 0.15) if cache_hit else token_count
        joules = effective_tokens * specs["joules_per_tok"]
        flops = effective_tokens * specs["flops_per_tok"]
        latency_ms = effective_tokens * specs["ms_per_tok"]
        return ResourceUnit(
            tokens=token_count,
            joules=round(joules, 4),
            flops=flops,
            latency_ms=round(latency_ms, 2),
            cache_hit=cache_hit
        )
