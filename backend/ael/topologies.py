"""
=============================================================================
AEL TOPOLOGIES: THREE MODELS OF AGENT COORDINATION
=============================================================================
Location: /Users/gch2021/Dev/Multi-Asset Workflows/backend/ael/topologies.py
Authority: LABORATORY.md

This module implements the three distinct coordination models:
  1. House Staff: Unified pipeline, direct in-memory context handoff, zero friction.
  2. Coasean Market: Autonomous micro-bidding, inter-agent subcontracting, fee splits.
  3. Federated Guild: Shared prompt caching, specialization pools, Penny budget sweep.
=============================================================================
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from .kernel import (
    ActionType,
    ModelTier,
    ResourceUnit,
    ExecutionReceipt,
    RunwayPool,
    SpendDoor,
    EpistemicTracker,
    InferenceKernel
)


@dataclass
class TaskDefinition:
    """Standardized unit of work used to benchmark all topologies equally."""
    task_id: str
    lookup_tokens: int = 250
    draft_tokens: int = 600
    audit_tokens: int = 350
    spend_amount: float = 30.0  # External action cost at the door


@dataclass
class TopologyResult:
    """Comprehensive performance telemetry for a completed or halted run."""
    topology_name: str
    tasks_attempted: int
    tasks_completed: int
    total_budget_allocated: float
    total_budget_burned: float
    budget_spent_on_work: float
    budget_spent_on_coordination: float
    budget_reclaimed_by_penny: float
    final_epistemic_confidence: float
    halted: bool
    halt_reason: Optional[str]
    receipts: List[ExecutionReceipt] = field(default_factory=list)

    @property
    def coordination_overhead_pct(self) -> float:
        if self.total_budget_burned <= 0:
            return 0.0
        return round((self.budget_spent_on_coordination / self.total_budget_burned) * 100, 2)


# =============================================================================
# 1. TOPOLOGY A: THE HOUSE (STAFF PIPELINE)
# =============================================================================
class HouseStaffTopology:
    """
    The House model: Staff seats (Scout, Scribble, Inspector, Porter).
    - Seats do NOT pay each other.
    - Zero coordination fee / zero friction handoff.
    - Spends wait at the door for the human.
    """
    def __init__(self, initial_credits: float = 1000.0, default_door_allowed: bool = True):
        self.runway = RunwayPool(initial_credits=initial_credits)
        self.door = SpendDoor(default_allowed=default_door_allowed)
        self.epistemic = EpistemicTracker()
        self.receipts: List[ExecutionReceipt] = []

    def run_workload(self, tasks: List[TaskDefinition]) -> TopologyResult:
        tasks_completed = 0
        spent_on_work = 0.0
        spent_on_coordination = 0.0

        for task in tasks:
            # 1. Scout Looks (No door wait)
            cost_look = InferenceKernel.calculate_burn(ModelTier.FAST_QUANTIZED, task.lookup_tokens, cache_hit=False)
            r_look = ExecutionReceipt(task.task_id, ActionType.LOOKUP, "Scout", ModelTier.FAST_QUANTIZED, cost_look, self.epistemic.confidence, "done")
            if not self.runway.burn(r_look):
                break
            spent_on_work += cost_look.compute_credits
            self.receipts.append(r_look)

            # 2. Scribble Drafts (No door wait, direct memory transfer)
            cost_draft = InferenceKernel.calculate_burn(ModelTier.BALANCED_STAFF, task.draft_tokens, cache_hit=True)
            self.epistemic.record_handover(ModelTier.BALANCED_STAFF, rigor=0.90)
            r_draft = ExecutionReceipt(task.task_id, ActionType.DRAFT, "Scribble", ModelTier.BALANCED_STAFF, cost_draft, self.epistemic.confidence, "done")
            if not self.runway.burn(r_draft):
                break
            spent_on_work += cost_draft.compute_credits
            self.receipts.append(r_draft)

            # 3. Inspector Audits (No door wait)
            cost_audit = InferenceKernel.calculate_burn(ModelTier.FRONTIER_DEEP, task.audit_tokens, cache_hit=True)
            self.epistemic.record_handover(ModelTier.FRONTIER_DEEP, rigor=0.98)
            r_audit = ExecutionReceipt(task.task_id, ActionType.AUDIT, "Inspector", ModelTier.FRONTIER_DEEP, cost_audit, self.epistemic.confidence, "done")
            if not self.runway.burn(r_audit):
                break
            spent_on_work += cost_audit.compute_credits
            self.receipts.append(r_audit)

            # 4. Porter comes to the door (GATED)
            if not self.door.check_permission(ActionType.SEND):
                # Pauses cleanly without leaking budget
                self.door.park({
                    "task_id": task.task_id,
                    "stage": "Waiting at Door",
                    "status": "Held for human permission",
                    "remaining_runway": self.runway.remaining_credits
                })
                break

            # Door opened by human: execute send
            send_cost = ResourceUnit(tokens=100, joules=0.5, flops=1e9, latency_ms=10.0)
            r_send = ExecutionReceipt(task.task_id, ActionType.SEND, "Porter", ModelTier.FAST_QUANTIZED, send_cost, self.epistemic.confidence, "sent")
            if not self.runway.burn(r_send):
                break
            spent_on_work += send_cost.compute_credits
            self.receipts.append(r_send)
            tasks_completed += 1

        return TopologyResult(
            topology_name="House Staff",
            tasks_attempted=len(tasks),
            tasks_completed=tasks_completed,
            total_budget_allocated=self.runway.initial_credits,
            total_budget_burned=self.runway.total_burned_credits,
            budget_spent_on_work=spent_on_work,
            budget_spent_on_coordination=spent_on_coordination,
            budget_reclaimed_by_penny=0.0,
            final_epistemic_confidence=self.epistemic.confidence,
            halted=self.runway.halted,
            halt_reason=self.runway.halt_reason,
            receipts=self.receipts
        )


# =============================================================================
# 2. TOPOLOGY B: COASEAN MACHINE MARKET (MICRO-BIDDING)
# =============================================================================
class CoaseanMarketTopology:
    """
    Market model: Independent micro-agents contracting via bids and fees.
    - Lookup subcontracts Draft with a 15% brokerage fee.
    - Draft subcontracts Audit with a 20% assembly fee.
    - Settlement escrow takes a 10% clearance fee.
    - Measures how much compute budget is eaten by internal coordination.
    """
    def __init__(self, initial_credits: float = 1000.0, default_door_allowed: bool = True):
        self.runway = RunwayPool(initial_credits=initial_credits)
        self.door = SpendDoor(default_allowed=default_door_allowed)
        self.epistemic = EpistemicTracker()
        self.receipts: List[ExecutionReceipt] = []

    def run_workload(self, tasks: List[TaskDefinition]) -> TopologyResult:
        tasks_completed = 0
        spent_on_work = 0.0
        spent_on_coordination = 0.0

        for task in tasks:
            # 1. Lookup Market Bid
            cost_look = InferenceKernel.calculate_burn(ModelTier.FAST_QUANTIZED, task.lookup_tokens, cache_hit=False)
            look_brokerage_tax = cost_look.compute_credits * 0.20
            total_look_cost = ResourceUnit(
                tokens=cost_look.tokens,
                joules=cost_look.joules * 1.20,
                flops=cost_look.flops * 1.20,
                latency_ms=cost_look.latency_ms + 40.0  # negotiation latency
            )
            r_look = ExecutionReceipt(task.task_id, ActionType.LOOKUP, "Market_Lookup_Node", ModelTier.FAST_QUANTIZED, total_look_cost, self.epistemic.confidence, "done")
            if not self.runway.burn(r_look):
                break
            spent_on_work += cost_look.compute_credits
            spent_on_coordination += look_brokerage_tax
            self.receipts.append(r_look)

            # 2. Draft Subcontracting Auction
            cost_draft = InferenceKernel.calculate_burn(ModelTier.BALANCED_STAFF, task.draft_tokens, cache_hit=False) # Cache miss across isolated agents
            self.epistemic.record_handover(ModelTier.BALANCED_STAFF, rigor=0.75) # Lower rigor in decentralized handoff
            draft_assembly_tax = cost_draft.compute_credits * 0.25
            total_draft_cost = ResourceUnit(
                tokens=cost_draft.tokens,
                joules=cost_draft.joules * 1.25,
                flops=cost_draft.flops * 1.25,
                latency_ms=cost_draft.latency_ms + 65.0
            )
            r_draft = ExecutionReceipt(task.task_id, ActionType.DRAFT, "Market_Draft_Node", ModelTier.BALANCED_STAFF, total_draft_cost, self.epistemic.confidence, "done")
            if not self.runway.burn(r_draft):
                break
            spent_on_work += cost_draft.compute_credits
            spent_on_coordination += draft_assembly_tax
            self.receipts.append(r_draft)

            # 3. Audit Escrow Verification
            cost_audit = InferenceKernel.calculate_burn(ModelTier.FRONTIER_DEEP, task.audit_tokens, cache_hit=False)
            self.epistemic.record_handover(ModelTier.FRONTIER_DEEP, rigor=0.92)
            audit_escrow_tax = cost_audit.compute_credits * 0.15
            total_audit_cost = ResourceUnit(
                tokens=cost_audit.tokens,
                joules=cost_audit.joules * 1.15,
                flops=cost_audit.flops * 1.15,
                latency_ms=cost_audit.latency_ms + 50.0
            )
            r_audit = ExecutionReceipt(task.task_id, ActionType.AUDIT, "Market_Audit_Node", ModelTier.FRONTIER_DEEP, total_audit_cost, self.epistemic.confidence, "done")
            if not self.runway.burn(r_audit):
                break
            spent_on_work += cost_audit.compute_credits
            spent_on_coordination += audit_escrow_tax
            self.receipts.append(r_audit)

            # 4. Gated Settlement Door
            if not self.door.check_permission(ActionType.SEND):
                self.door.park({
                    "task_id": task.task_id,
                    "stage": "Waiting at Market Door",
                    "status": "Held for human permission",
                    "remaining_runway": self.runway.remaining_credits
                })
                break

            send_cost = ResourceUnit(tokens=100, joules=0.5, flops=1e9, latency_ms=10.0)
            r_send = ExecutionReceipt(task.task_id, ActionType.SEND, "Market_Settlement_Node", ModelTier.FAST_QUANTIZED, send_cost, self.epistemic.confidence, "sent")
            if not self.runway.burn(r_send):
                break
            spent_on_work += send_cost.compute_credits
            self.receipts.append(r_send)
            tasks_completed += 1

        return TopologyResult(
            topology_name="Coasean Market",
            tasks_attempted=len(tasks),
            tasks_completed=tasks_completed,
            total_budget_allocated=self.runway.initial_credits,
            total_budget_burned=self.runway.total_burned_credits,
            budget_spent_on_work=spent_on_work,
            budget_spent_on_coordination=spent_on_coordination,
            budget_reclaimed_by_penny=0.0,
            final_epistemic_confidence=self.epistemic.confidence,
            halted=self.runway.halted,
            halt_reason=self.runway.halt_reason,
            receipts=self.receipts
        )


# =============================================================================
# 3. TOPOLOGY C: FEDERATED GUILD (SHARED CACHE & BUDGET RECLAMATION)
# =============================================================================
class FederatedGuildTopology:
    """
    Guild model: Shared prompt caching across specialist pools with Penny budget reclamation.
    - Specialized pools (Research Guild, Writing Guild, Verification Guild).
    - Shared context caching cuts ingestion cost by 85%.
    - Penny reclaims unspent allocation cushions directly to the runway.
    """
    def __init__(self, initial_credits: float = 1000.0, default_door_allowed: bool = True):
        self.runway = RunwayPool(initial_credits=initial_credits)
        self.door = SpendDoor(default_allowed=default_door_allowed)
        self.epistemic = EpistemicTracker()
        self.receipts: List[ExecutionReceipt] = []
        self.penny_reclaimed: float = 0.0

    def run_workload(self, tasks: List[TaskDefinition]) -> TopologyResult:
        tasks_completed = 0
        spent_on_work = 0.0
        spent_on_coordination = 0.0

        for task in tasks:
            # Shared cache hits across the guild
            cost_look = InferenceKernel.calculate_burn(ModelTier.FAST_QUANTIZED, task.lookup_tokens, cache_hit=True)
            r_look = ExecutionReceipt(task.task_id, ActionType.LOOKUP, "Guild_Researcher", ModelTier.FAST_QUANTIZED, cost_look, self.epistemic.confidence, "done")
            if not self.runway.burn(r_look):
                break
            spent_on_work += cost_look.compute_credits
            self.receipts.append(r_look)

            cost_draft = InferenceKernel.calculate_burn(ModelTier.BALANCED_STAFF, task.draft_tokens, cache_hit=True)
            self.epistemic.record_handover(ModelTier.BALANCED_STAFF, rigor=0.94)
            r_draft = ExecutionReceipt(task.task_id, ActionType.DRAFT, "Guild_Synthesizer", ModelTier.BALANCED_STAFF, cost_draft, self.epistemic.confidence, "done")
            if not self.runway.burn(r_draft):
                break
            spent_on_work += cost_draft.compute_credits
            self.receipts.append(r_draft)

            cost_audit = InferenceKernel.calculate_burn(ModelTier.FRONTIER_DEEP, task.audit_tokens, cache_hit=True)
            self.epistemic.record_handover(ModelTier.FRONTIER_DEEP, rigor=0.99)
            r_audit = ExecutionReceipt(task.task_id, ActionType.AUDIT, "Guild_Auditor", ModelTier.FRONTIER_DEEP, cost_audit, self.epistemic.confidence, "done")
            if not self.runway.burn(r_audit):
                break
            spent_on_work += cost_audit.compute_credits
            self.receipts.append(r_audit)

            # Penny sweeps unspent allocation back
            nominal_estimate = (task.lookup_tokens + task.draft_tokens + task.audit_tokens) / 10.0
            actual_burned = cost_look.compute_credits + cost_draft.compute_credits + cost_audit.compute_credits
            saved = max(0.0, nominal_estimate - actual_burned)
            self.penny_reclaimed += saved
            self.runway.reclaim(saved)

            # Door check
            if not self.door.check_permission(ActionType.SEND):
                self.door.park({
                    "task_id": task.task_id,
                    "stage": "Waiting at Guild Door",
                    "status": "Held for human permission",
                    "remaining_runway": self.runway.remaining_credits
                })
                break

            send_cost = ResourceUnit(tokens=100, joules=0.5, flops=1e9, latency_ms=10.0)
            r_send = ExecutionReceipt(task.task_id, ActionType.SEND, "Guild_Steward", ModelTier.FAST_QUANTIZED, send_cost, self.epistemic.confidence, "sent")
            if not self.runway.burn(r_send):
                break
            spent_on_work += send_cost.compute_credits
            self.receipts.append(r_send)
            tasks_completed += 1

        return TopologyResult(
            topology_name="Federated Guild",
            tasks_attempted=len(tasks),
            tasks_completed=tasks_completed,
            total_budget_allocated=self.runway.initial_credits,
            total_budget_burned=self.runway.total_burned_credits,
            budget_spent_on_work=spent_on_work,
            budget_spent_on_coordination=spent_on_coordination,
            budget_reclaimed_by_penny=self.penny_reclaimed,
            final_epistemic_confidence=self.epistemic.confidence,
            halted=self.runway.halted,
            halt_reason=self.runway.halt_reason,
            receipts=self.receipts
        )
