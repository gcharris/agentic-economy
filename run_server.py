"""
Server launcher for Institutional Digital Finance Sandbox
Starts FastAPI server on http://127.0.0.1:8000
"""

import uvicorn

if __name__ == "__main__":
    print("\n=======================================================")
    print("🚀 Starting Institutional Digital Finance Control Room")
    print("📍 URL: http://127.0.0.1:8000")
    print("⚡ Real-time WebSocket: ws://127.0.0.1:8000/ws")
    print("=======================================================\n")
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=False)
