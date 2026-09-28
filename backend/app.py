"""
FastAPI Server & WebSocket streaming for Institutional Finance Sandbox.
Grounded in: "The Connective Tissue of Digital Finance"
"""

import asyncio
import os
from typing import Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .engine import SimulationEngine
from .models import SimulationConfig

app = FastAPI(
    title="Institutional Digital Finance Closed-Loop Sandbox",
    description="Multi-agent institutional simulation platform for 3-tier cash, ISO 20022 rails, and programmable workflows",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Simulation Engine Instance
sim_engine = SimulationEngine()
sim_task: asyncio.Task = None
sim_speed: float = 1.0  # seconds per step in auto mode
active_websockets: List[WebSocket] = []


class ConfigUpdateRequest(BaseModel):
    bridge_latency: int = None
    failure_rate: float = None
    annual_yield_percent: float = None
    treasurer_sweep_threshold: float = None
    treasurer_sweep_buffer: float = None
    dvp_producer_split: float = None
    dvp_treasury_split: float = None
    dvp_csd_split: float = None
    collateral_multiplier: float = None


class RunStepsRequest(BaseModel):
    steps: int = 10


async def broadcast_state(event_data: Dict[str, Any] = None):
    """Broadcasts state to all active WebSocket listeners."""
    if not active_websockets:
        return
    state = sim_engine.get_state()
    payload = {
        "type": "SIMULATION_UPDATE",
        "state": state,
        "latest_event": event_data
    }
    dead_sockets = []
    for ws in active_websockets:
        try:
            await ws.send_json(payload)
        except Exception:
            dead_sockets.append(ws)
    for ws in dead_sockets:
        if ws in active_websockets:
            active_websockets.remove(ws)


async def background_sim_loop():
    """Background loop when auto-run is toggled on."""
    global sim_speed
    while True:
        try:
            if sim_engine.is_running:
                step_result = sim_engine.step()
                await broadcast_state(step_result)
            await asyncio.sleep(sim_speed)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in background simulation loop: {e}")
            await asyncio.sleep(1.0)


@app.on_event("startup")
async def startup_event():
    global sim_task
    sim_task = asyncio.create_task(background_sim_loop())


@app.on_event("shutdown")
async def shutdown_event():
    global sim_task
    if sim_task:
        sim_task.cancel()


# ---------------------------------------------------------------------------
# REST API ENDPOINTS
# ---------------------------------------------------------------------------

@app.get("/api/status")
def get_status():
    return sim_engine.get_state()


@app.post("/api/step")
async def execute_single_step():
    result = sim_engine.step()
    await broadcast_state(result)
    return {"status": "ok", "step": sim_engine.step_number, "result": result}


@app.post("/api/run")
async def execute_multiple_steps(req: RunStepsRequest):
    count = min(max(req.steps, 1), 100)
    last_res = None
    for _ in range(count):
        last_res = sim_engine.step()
    await broadcast_state(last_res)
    return {"status": "ok", "steps_executed": count, "current_step": sim_engine.step_number}


@app.post("/api/play")
async def start_auto_run(speed: float = 1.0):
    global sim_speed
    sim_speed = max(0.2, min(5.0, speed))
    sim_engine.is_running = True
    await broadcast_state()
    return {"status": "ok", "running": True, "speed": sim_speed}


@app.post("/api/pause")
async def pause_auto_run():
    sim_engine.is_running = False
    await broadcast_state()
    return {"status": "ok", "running": False}


@app.post("/api/reset")
async def reset_simulation():
    sim_engine.is_running = False
    sim_engine.reset()
    await broadcast_state()
    return {"status": "ok", "reset": True}


@app.post("/api/config")
async def update_simulation_config(req: ConfigUpdateRequest):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    sim_engine.update_config(updates)
    await broadcast_state()
    return {"status": "ok", "config": sim_engine.config.to_dict()}


@app.post("/api/scenario/{name}")
async def apply_preset_scenario(name: str):
    valid_scenarios = ["baseline", "high_yield_rush", "network_congestion", "collateral_crisis"]
    if name not in valid_scenarios:
        raise HTTPException(status_code=400, detail=f"Invalid scenario. Choose from: {valid_scenarios}")
    sim_engine.load_scenario(name)
    await broadcast_state()
    return {"status": "ok", "scenario": name, "config": sim_engine.config.to_dict()}


# ---------------------------------------------------------------------------
# MAYOR ACTIONS (SIMS GAME MODE)
# ---------------------------------------------------------------------------

@app.post("/api/mayor/stimulus")
async def mayor_stimulus(amount: float = 100.0):
    ev = sim_engine.mayor_drop_stimulus(amount)
    await broadcast_state(ev)
    return {"status": "ok", "action": "stimulus", "event": ev}


@app.post("/api/mayor/shopping-spree")
async def mayor_shopping_spree():
    events = sim_engine.mayor_trigger_shopping_spree()
    await broadcast_state({"type": "SHOPPING_SPREE", "events": events})
    return {"status": "ok", "action": "shopping_spree", "events": events}


@app.post("/api/mayor/harvest")
async def mayor_harvest():
    events = sim_engine.mayor_harvest_piggy_bank()
    await broadcast_state({"type": "GOLDEN_HARVEST", "events": events})
    return {"status": "ok", "action": "harvest", "events": events}


@app.post("/api/mayor/courier")
async def mayor_courier():
    ev = sim_engine.mayor_dispatch_courier()
    await broadcast_state(ev)
    return {"status": "ok", "action": "courier", "event": ev}



@app.get("/api/message/{msg_id}")
def get_message_detail(msg_id: str):
    all_msgs = sim_engine.bridge.message_queue + sim_engine.bridge.processed_messages
    for m in all_msgs:
        if m.msg_id == msg_id:
            return m.to_dict()
    raise HTTPException(status_code=404, detail="Message ID not found")


# ---------------------------------------------------------------------------
# WEBSOCKET STREAMING
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        # Send initial state on connection
        await websocket.send_json({
            "type": "INITIAL_STATE",
            "state": sim_engine.get_state()
        })
        while True:
            data = await websocket.receive_text()
            # Handle client-side commands via WS if needed
            if data == "PING":
                await websocket.send_text("PONG")
            elif data == "STEP":
                res = sim_engine.step()
                await broadcast_state(res)
    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
    except Exception:
        if websocket in active_websockets:
            active_websockets.remove(websocket)


# ---------------------------------------------------------------------------
# STATIC FILES SERVING (UI)
# ---------------------------------------------------------------------------

static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
