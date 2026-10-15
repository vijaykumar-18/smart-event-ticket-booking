import asyncio
from collections import defaultdict

from fastapi import WebSocket


class AvailabilityConnections:
    def __init__(self):
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, event_id: int, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self._connections[event_id].add(websocket)

    async def disconnect(self, event_id: int, websocket: WebSocket):
        async with self._lock:
            connections = self._connections.get(event_id)
            if connections:
                connections.discard(websocket)
                if not connections:
                    self._connections.pop(event_id, None)

    async def broadcast(self, event_id: int, available_tickets: int, event_status: str):
        payload = {
            "event_id": event_id,
            "available_tickets": available_tickets,
            "event_status": event_status,
        }
        async with self._lock:
            connections = tuple(self._connections.get(event_id, ()))
        if not connections:
            return
        results = await asyncio.gather(
            *(connection.send_json(payload) for connection in connections),
            return_exceptions=True,
        )
        disconnected = [
            connection
            for connection, result in zip(connections, results)
            if isinstance(result, Exception)
        ]
        for connection in disconnected:
            await self.disconnect(event_id, connection)

    async def broadcast_announcement(self, event_id: int, announcement: dict):
        payload = {"type": "announcement", "announcement": announcement}
        async with self._lock:
            connections = tuple(self._connections.get(event_id, ()))
        if not connections:
            return
        results = await asyncio.gather(
            *(connection.send_json(payload) for connection in connections),
            return_exceptions=True,
        )
        for connection, result in zip(connections, results):
            if isinstance(result, Exception):
                await self.disconnect(event_id, connection)


availability_connections = AvailabilityConnections()