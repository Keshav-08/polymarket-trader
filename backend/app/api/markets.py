from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import httpx
import json
import redis as redis_client
from typing import Optional
from app.core.database import get_db
from app.core.config import settings
from app.services.rule_evaluator import evaluate_rules
from app.api.settings import get_setting

router = APIRouter()

GAMMA_BASE = "https://gamma-api.polymarket.com"
CACHE_TTL = 25  # seconds — expires just before the 30s poll interval
PINNED_KEY = "polymarket:pinned"
CACHE_KEY = "polymarket:raw"

_previous_probs: dict[str, float] = {}

# Redis connection
def _get_redis():
    try:
        r = redis_client.from_url(settings.redis_url, decode_responses=True)
        r.ping()
        return r
    except Exception:
        return None

CATEGORY_KEYWORDS = {
    "politics": ["election", "president", "congress", "senate", "vote", "party", "democrat", "republican", "biden", "trump", "governor", "minister", "parliament", "policy", "war", "military", "nato", "sanctions", "treaty", "diplomatic"],
    "sports":   ["world cup", "nba", "nfl", "mlb", "nhl", "fifa", "champion", "tournament", "playoff", "super bowl", "olympics", "tennis", "golf", "soccer", "football", "basketball", "baseball", "hockey", "league", "team", "match", "game"],
    "crypto":   ["bitcoin", "ethereum", "crypto", "btc", "eth", "solana", "coinbase", "binance", "defi", "nft", "blockchain", "token", "altcoin"],
    "economics":["fed", "inflation", "interest rate", "gdp", "recession", "unemployment", "cpi", "tariff", "trade", "market", "stock", "bond", "treasury", "dollar", "currency", "oil", "gas", "energy"],
    "entertainment": ["oscars", "grammy", "emmy", "movie", "film", "album", "artist", "singer", "actor", "rihanna", "taylor", "gta", "netflix", "spotify", "box office"],
    "science":  ["nasa", "spacex", "climate", "ai", "cancer", "vaccine", "drug", "fda", "virus", "pandemic", "earthquake", "hurricane", "storm"],
}


def _infer_category(question: str) -> str:
    q = question.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in q for kw in keywords):
            return category
    return "other"


def _extract_probability(market: dict) -> Optional[float]:
    try:
        prices = market.get("outcomePrices")
        if isinstance(prices, str):
            prices = json.loads(prices)
        if prices and len(prices) > 0:
            return round(float(prices[0]) * 100, 1)
    except Exception:
        pass
    best_bid = market.get("bestBid")
    best_ask = market.get("bestAsk")
    if best_bid and best_ask:
        try:
            mid = (float(best_bid) + float(best_ask)) / 2
            return round(mid * 100, 1)
        except Exception:
            pass
    return None


async def _fetch_markets_raw(limit: int) -> list:
    """Fetch raw market data from Polymarket, using Redis cache if available."""
    r = _get_redis()

    # Try cache first
    if r:
        cached = r.get(CACHE_KEY)
        if cached:
            print("📦 CACHE HIT: serving Polymarket data from Redis", flush=True)
            return json.loads(cached)

    # Cache miss — fetch from Polymarket
    print("🌐 CACHE MISS: fetching fresh Polymarket data", flush=True)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{GAMMA_BASE}/markets",
            params={
                "limit": limit,
                "active": "true",
                "closed": "false",
                "order": "volume24hr",
                "ascending": "false",
            },
        )
        resp.raise_for_status()
        markets_raw = resp.json()

    # Store in Redis with TTL
    if r:
        try:
            r.setex(CACHE_KEY, CACHE_TTL, json.dumps(markets_raw))
            print(f"💾 CACHED: {len(markets_raw)} markets stored in Redis for {CACHE_TTL}s", flush=True)
        except Exception as e:
            print(f"⚠️  Redis write failed: {e}", flush=True)

    return markets_raw


def _get_pinned_ids() -> set[str]:
    """Get pinned market IDs from Redis (persistent across restarts)."""
    r = _get_redis()
    if not r:
        return set()
    try:
        members = r.smembers(PINNED_KEY)
        return set(members)
    except Exception:
        return set()


@router.get("/markets")
async def get_markets(
    limit: int = 20,
    search: Optional[str] = None,
    category: Optional[str] = None,
    sort: Optional[str] = "volume",
    db: Session = Depends(get_db),
):
    global _previous_probs

    markets_limit = int(get_setting("markets_limit", db))
    signal_threshold = float(get_setting("signal_threshold_pct", db))
    pinned_ids = _get_pinned_ids()

    try:
        markets_raw = await _fetch_markets_raw(markets_limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Polymarket unreachable: {str(e)}")

    enriched = []

    for m in markets_raw:
        if m.get("closed") or m.get("archived"):
            continue

        market_id = str(m.get("id", ""))
        question = m.get("question") or m.get("title", "Unknown market")
        prob = _extract_probability(m)

        if prob is None or prob <= 0 or prob >= 100:
            continue

        prev = _previous_probs.get(market_id)
        shift = round(prob - prev, 1) if prev is not None else None
        is_signal = abs(shift) >= signal_threshold if shift is not None else False
        inferred_category = _infer_category(question)

        enriched.append({
            "id": market_id,
            "question": question,
            "probability": prob,
            "previous_probability": prev,
            "shift": shift,
            "is_signal": is_signal,
            "direction": (
                "up" if (shift and shift > 0)
                else "down" if (shift and shift < 0)
                else "flat"
            ),
            "volume": m.get("volume24hr") or m.get("volume"),
            "end_date": m.get("endDate"),
            "category": inferred_category,
            "pinned": market_id in pinned_ids,
            "featured": m.get("featured", False),
        })

        _previous_probs[market_id] = prob

    # ── Search filter ──────────────────────────────────────────────────────────
    if search:
        search_lower = search.lower()
        enriched = [m for m in enriched if search_lower in m["question"].lower()]

    # ── Category filter ────────────────────────────────────────────────────────
    if category and category != "all":
        enriched = [m for m in enriched if m["category"] == category]

    # ── Sort ───────────────────────────────────────────────────────────────────
    if sort == "probability":
        enriched.sort(key=lambda x: -x["probability"])
    elif sort == "shift":
        enriched.sort(key=lambda x: (not x["is_signal"], -(abs(x["shift"]) if x["shift"] else 0)))
    else:
        enriched.sort(key=lambda x: (not x["pinned"], not x["is_signal"], -x["probability"]))

    signals = [m for m in enriched if m["is_signal"]]
    pinned = [m for m in enriched if m["pinned"]]
    triggers = evaluate_rules(enriched, db)

    category_counts: dict[str, int] = {}
    for m in enriched:
        cat = m["category"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

    return {
        "markets": enriched,
        "signals": signals,
        "pinned": pinned,
        "signal_count": len(signals),
        "total": len(enriched),
        "rule_triggers": triggers,
        "rule_trigger_count": len(triggers),
        "category_counts": category_counts,
    }


@router.post("/markets/{market_id}/pin")
async def pin_market(market_id: str):
    r = _get_redis()
    if r:
        r.sadd(PINNED_KEY, market_id)
    return {"message": "Pinned", "id": market_id}


@router.delete("/markets/{market_id}/pin")
async def unpin_market(market_id: str):
    r = _get_redis()
    if r:
        r.srem(PINNED_KEY, market_id)
    return {"message": "Unpinned", "id": market_id}


@router.get("/markets/pinned")
async def get_pinned():
    return {"pinned_ids": list(_get_pinned_ids())}


@router.get("/markets/cache-status")
async def cache_status():
    """Debug endpoint — shows Redis cache state."""
    r = _get_redis()
    if not r:
        return {"redis": "unavailable"}
    cached = r.get(CACHE_KEY)
    ttl = r.ttl(CACHE_KEY)
    pinned = list(r.smembers(PINNED_KEY))
    return {
        "redis": "connected",
        "cache_hit": cached is not None,
        "cache_ttl_seconds": ttl,
        "cached_markets": len(json.loads(cached)) if cached else 0,
        "pinned_count": len(pinned),
        "pinned_ids": pinned,
    }