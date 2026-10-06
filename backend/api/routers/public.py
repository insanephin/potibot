from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from core.channels import search_channels
from core.commands import COMMANDS
from core.stats import RANKING_PERIODS, get_bot_status, get_track_ranking

router = APIRouter(tags=["public"])


@router.get("/search")
async def search_channel(request: Request) -> JSONResponse:
    query = request.query_params.get("q")
    if not query:
        return JSONResponse({"error": "Missing query parameter."}, status_code=400)

    if len(query) < 2:
        return JSONResponse({"error": "Query parameter must be at least 2 characters long."}, status_code=400)

    return JSONResponse(await search_channels(query))


@router.get("/stats/ranking")
async def stats_ranking(period: str = "day") -> list[dict]:
    if period not in RANKING_PERIODS:
        raise HTTPException(status_code=400, detail="period must be one of day, week, month.")
    return await get_track_ranking(period)


@router.get("/stats/status")
async def stats_status() -> dict:
    return await get_bot_status()


@router.get("/commands")
async def commands() -> list[dict]:
    return COMMANDS
