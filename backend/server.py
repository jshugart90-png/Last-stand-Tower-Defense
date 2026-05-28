from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from supabase import create_client as create_supabase_client
from postgrest.exceptions import APIError
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from bson import ObjectId
import hashlib
import asyncio
import json
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database config (Mongo active, Supabase-ready env supported)
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
DB_PROVIDER = os.environ.get("DB_PROVIDER", "mongo").strip().lower()
mongo_url = os.environ.get('MONGO_URL', '')
db_name = os.environ.get('DB_NAME', 'last_stand_defense')
if not mongo_url:
    mongo_url = "mongodb://localhost:27017"
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]
supabase_url = os.environ.get("SUPABASE_URL", "").strip()
supabase_service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
supabase = (
    create_supabase_client(supabase_url, supabase_service_role_key)
    if DB_PROVIDER == "supabase" and supabase_url and supabase_service_role_key
    else None
)
if DB_PROVIDER == "supabase" and not supabase:
    raise RuntimeError(
        "DB_PROVIDER is 'supabase' but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    )

raw_cors_origins = os.environ.get("CORS_ORIGINS", "*").strip()
if raw_cors_origins == "*":
    cors_origins = ["*"]
else:
    cors_origins = [origin.strip() for origin in raw_cors_origins.split(",") if origin.strip()]
if not cors_origins:
    cors_origins = ["*"]

# Create the main app without a prefix
app = FastAPI(title="Last Stand Defense API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

INVALID_PURCHASE_RECEIPT_ERROR = "Invalid or missing purchase receipt."
APPLE_VERIFY_RECEIPT_URL = "https://buy.itunes.apple.com/verifyReceipt"
APPLE_SANDBOX_VERIFY_RECEIPT_URL = "https://sandbox.itunes.apple.com/verifyReceipt"

# Helper to convert ObjectId to string
def serialize_doc(doc):
    if doc is None:
        return None
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    elif "id" in doc:
        doc["_id"] = str(doc["id"])
    return doc

def _normalize_filter(f: Dict[str, Any]) -> Dict[str, Any]:
    if "_id" in f:
        nf = dict(f)
        nf["id"] = str(nf.pop("_id"))
        return nf
    return f

def _to_supabase_json(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _to_supabase_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_supabase_json(v) for v in value]
    return value

async def repo_find_one(table: str, where: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if DB_PROVIDER == "supabase" and supabase:
        try:
            where = _normalize_filter(where)
            q = supabase.table(table).select("*").limit(1)
            for k, v in where.items():
                q = q.eq(k, v)
            res = q.execute()
            return res.data[0] if res.data else None
        except APIError as e:
            logger.warning(f"Supabase find_one failed on {table}: {e}")
            return None
    return await getattr(db, table).find_one(where)

async def repo_insert_one(table: str, doc: Dict[str, Any]) -> Dict[str, Any]:
    if DB_PROVIDER == "supabase" and supabase:
        try:
            payload = _to_supabase_json(doc)
            res = supabase.table(table).insert(payload).execute()
            if not res.data:
                raise HTTPException(status_code=500, detail=f"Insert failed for {table}")
            return res.data[0]
        except APIError as e:
            logger.error(f"Supabase insert failed on {table}: {e}")
            raise HTTPException(status_code=500, detail=f"Supabase insert failed for {table}")
    result = await getattr(db, table).insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc

async def repo_update_one(table: str, where: Dict[str, Any], set_data: Dict[str, Any], upsert: bool = False) -> None:
    if DB_PROVIDER == "supabase" and supabase:
        try:
            where = _normalize_filter(where)
            payload = _to_supabase_json(set_data)
            if upsert:
                existing = await repo_find_one(table, where)
                if existing:
                    q = supabase.table(table).update(payload)
                    for k, v in where.items():
                        q = q.eq(k, v)
                    q.execute()
                else:
                    insert_payload = {**where, **payload}
                    supabase.table(table).insert(insert_payload).execute()
            else:
                q = supabase.table(table).update(payload)
                for k, v in where.items():
                    q = q.eq(k, v)
                q.execute()
        except APIError as e:
            logger.error(f"Supabase update failed on {table}: {e}")
            raise HTTPException(status_code=500, detail=f"Supabase update failed for {table}")
        return
    await getattr(db, table).update_one(where, {"$set": set_data}, upsert=upsert)

async def repo_find_one_and_update(table: str, where: Dict[str, Any], set_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if DB_PROVIDER == "supabase" and supabase:
        await repo_update_one(table, where, set_data, upsert=False)
        return await repo_find_one(table, where)
    return await getattr(db, table).find_one_and_update(where, {"$set": set_data}, return_document=True)

async def repo_find_many(table: str, sort_field: str, sort_desc: bool, skip: int, limit: int, max_len: Optional[int] = None) -> List[Dict[str, Any]]:
    if DB_PROVIDER == "supabase" and supabase:
        try:
            q = supabase.table(table).select("*").order(sort_field, desc=sort_desc)
            if max_len is not None:
                q = q.limit(max_len)
            else:
                q = q.range(skip, skip + limit - 1)
            res = q.execute()
            data = res.data or []
            if max_len is not None:
                return data
            return data
        except APIError as e:
            logger.warning(f"Supabase find_many failed on {table}: {e}")
            return []
    cursor = getattr(db, table).find().sort(sort_field, -1 if sort_desc else 1).skip(skip).limit(limit)
    return await cursor.to_list(limit)

async def repo_count_gt(table: str, field: str, value: Any) -> int:
    if DB_PROVIDER == "supabase" and supabase:
        try:
            res = supabase.table(table).select("id", count="exact").gt(field, value).execute()
            return int(res.count or 0)
        except APIError as e:
            logger.warning(f"Supabase count failed on {table}: {e}")
            return 0
    return await getattr(db, table).count_documents({field: {"$gt": value}})


def _lb_tuple(e: Dict[str, Any]) -> tuple:
    """Sort key: primary score = lifetime kills + last run gems; tiebreak by lifetime kills then run gems."""
    lk = int(e.get("lifetime_enemies_killed", 0) or 0)
    g = int(e.get("last_run_gems", 0) or 0)
    score = lk + g
    return (score, lk, g)


async def repo_leaderboard_fetch_all(max_docs: int = 2000) -> List[Dict[str, Any]]:
    """Load leaderboard rows for in-memory sort (handles legacy rows missing new fields)."""
    if DB_PROVIDER == "supabase" and supabase:
        try:
            res = supabase.table("leaderboard").select("*").limit(max_docs).execute()
            return list(res.data or [])
        except APIError as e:
            logger.warning(f"Supabase leaderboard fetch failed: {e}")
            return []
    cursor = db.leaderboard.find().limit(max_docs)
    return await cursor.to_list(max_docs)

# ==================== Models ====================

class PlayerCreate(BaseModel):
    nickname: str
    device_id: str

class PlayerUpdate(BaseModel):
    nickname: Optional[str] = None
    xp: Optional[int] = None
    level: Optional[int] = None
    gems: Optional[int] = None
    total_waves_survived: Optional[int] = None
    games_played: Optional[int] = None
    unlocked_towers: Optional[List[str]] = None
    unlocked_skins: Optional[List[str]] = None
    equipped_skins: Optional[Dict[str, str]] = None
    premium: Optional[bool] = None
    arena_expansions: Optional[int] = None
    reward_cooldowns: Optional[Dict[str, str]] = None

class Player(BaseModel):
    id: str = Field(alias="_id")
    nickname: str
    device_id: str
    xp: int = 0
    level: int = 1
    gems: int = 0
    total_waves_survived: int = 0
    games_played: int = 0
    best_wave: int = 0
    lifetime_enemies_killed: int = 0
    unlocked_towers: List[str] = ["machine_gun"]
    unlocked_skins: List[str] = ["default"]
    equipped_skins: Dict[str, str] = {}
    premium: bool = False
    arena_expanded: bool = False
    reward_cooldowns: Dict[str, str] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True

class LeaderboardEntry(BaseModel):
    id: str = Field(alias="_id")
    player_id: str
    nickname: str
    best_wave: int
    total_waves_survived: int
    games_played: int
    lifetime_enemies_killed: int = 0
    last_run_gems: int = 0
    last_run_enemies_killed: int = 0
    leaderboard_score: int = 0
    updated_at: datetime

    class Config:
        populate_by_name = True

class GameResult(BaseModel):
    player_id: str
    wave_reached: int
    enemies_killed: int
    towers_placed: int
    duration_seconds: int
    coins_earned: int
    run_bonus_gems: int = 0  # daily challenge gem bonus from client (capped server-side)

class RewardClaim(BaseModel):
    player_id: str
    reward_type: str  # "gems", "revive", "double_damage"
    ad_type: str  # "rewarded", "interstitial"

class PurchaseRequest(BaseModel):
    player_id: str
    item_type: str  # "premium", "arena_expansion", "skin", "gems"
    item_id: Optional[str] = None
    gems_amount: Optional[int] = None  # for gem pack purchases
    platform: str  # "ios" or "android"
    receipt_data: Optional[str] = None
    purchase_token: Optional[str] = None

class AnalyticsEvent(BaseModel):
    player_id: str
    event_type: str
    event_data: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# ==================== Gem Reward Calculations ====================

def calculate_gem_reward(wave_reached: int, enemies_killed: int) -> dict:
    """Match client run gem formula (scaled, ~65% lower than legacy rates)."""
    raw = max(0, int(wave_reached * 0.75) + (enemies_killed // 20))
    total = int(0.35 * raw)
    return {
        "base_scaled": total,
        "raw_performance": raw,
        "total_gems": total,
    }


def _http_post_json(url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    request_headers = {"Content-Type": "application/json"}
    if headers:
        request_headers.update(headers)
    req = urllib_request.Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except (urllib_error.URLError, urllib_error.HTTPError, json.JSONDecodeError) as exc:
        logger.warning("POST %s failed during receipt verification: %s", url, exc)
        return None


def _http_get_json(url: str, headers: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    req = urllib_request.Request(url=url, headers=headers or {}, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except (urllib_error.URLError, urllib_error.HTTPError, json.JSONDecodeError) as exc:
        logger.warning("GET %s failed during receipt verification: %s", url, exc)
        return None


async def _validate_apple_receipt(receipt_data: str) -> bool:
    payload: Dict[str, Any] = {"receipt-data": receipt_data}
    apple_shared_secret = os.environ.get("APPLE_SHARED_SECRET", "").strip()
    if apple_shared_secret:
        payload["password"] = apple_shared_secret

    production_result = await asyncio.to_thread(_http_post_json, APPLE_VERIFY_RECEIPT_URL, payload)
    if not production_result:
        return False
    if int(production_result.get("status", -1)) == 0:
        return True

    # 21007 = sandbox receipt sent to production endpoint.
    if int(production_result.get("status", -1)) == 21007:
        sandbox_result = await asyncio.to_thread(_http_post_json, APPLE_SANDBOX_VERIFY_RECEIPT_URL, payload)
        return bool(sandbox_result) and int(sandbox_result.get("status", -1)) == 0

    return False


async def _validate_google_purchase(product_id: str, purchase_token: str) -> bool:
    package_name = os.environ.get("GOOGLE_PLAY_PACKAGE_NAME", "").strip()
    access_token = os.environ.get("GOOGLE_PLAY_ACCESS_TOKEN", "").strip()
    if not package_name or not access_token:
        logger.warning("Google receipt verification skipped: GOOGLE_PLAY_PACKAGE_NAME or GOOGLE_PLAY_ACCESS_TOKEN missing")
        return False

    encoded_package_name = urllib_parse.quote(package_name, safe="")
    encoded_product_id = urllib_parse.quote(product_id, safe="")
    encoded_token = urllib_parse.quote(purchase_token, safe="")

    url = (
        "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
        f"{encoded_package_name}/purchases/products/{encoded_product_id}/tokens/{encoded_token}"
    )
    response = await asyncio.to_thread(
        _http_get_json,
        url,
        {"Authorization": f"Bearer {access_token}"},
    )
    if not response:
        return False

    # For one-time products, purchaseState=0 means purchased.
    return int(response.get("purchaseState", -1)) == 0

# ==================== Player Routes ====================

@api_router.post("/players", response_model=dict)
async def create_player(player_data: PlayerCreate):
    """Create a new player or return existing one by device_id"""
    existing = await repo_find_one("players", {"device_id": player_data.device_id})
    if existing:
        return serialize_doc(existing)
    
    player_doc = {
        "nickname": player_data.nickname,
        "device_id": player_data.device_id,
        "xp": 0,
        "level": 1,
        "gems": 0,
        "total_waves_survived": 0,
        "games_played": 0,
        "best_wave": 0,
        "lifetime_enemies_killed": 0,
        "unlocked_towers": ["machine_gun"],
        "unlocked_skins": ["default"],
        "equipped_skins": {},
        "premium": False,
        "arena_expansions": 0,
        "reward_cooldowns": {},
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    inserted = await repo_insert_one("players", player_doc)
    
    await repo_insert_one("leaderboard", {
        "player_id": str(inserted.get("_id") or inserted.get("id")),
        "nickname": player_data.nickname,
        "best_wave": 0,
        "total_waves_survived": 0,
        "games_played": 0,
        "lifetime_enemies_killed": 0,
        "last_run_gems": 0,
        "last_run_enemies_killed": 0,
        "leaderboard_score": 0,
        "updated_at": datetime.utcnow()
    })
    
    return serialize_doc(inserted)

@api_router.get("/players/{player_id}", response_model=dict)
async def get_player(player_id: str):
    """Get player by ID"""
    try:
        where = {"_id": ObjectId(player_id)} if DB_PROVIDER == "mongo" else {"_id": player_id}
        player = await repo_find_one("players", where)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        return serialize_doc(player)
    except Exception as e:
        logger.error(f"Error getting player: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/players/device/{device_id}", response_model=dict)
async def get_player_by_device(device_id: str):
    """Get player by device ID"""
    player = await repo_find_one("players", {"device_id": device_id})
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return serialize_doc(player)

@api_router.patch("/players/{player_id}", response_model=dict)
async def update_player(player_id: str, update_data: PlayerUpdate):
    """Update player data"""
    try:
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        where = {"_id": ObjectId(player_id)} if DB_PROVIDER == "mongo" else {"_id": player_id}
        result = await repo_find_one_and_update("players", where, update_dict)
        
        if not result:
            raise HTTPException(status_code=404, detail="Player not found")
        
        return serialize_doc(result)
    except Exception as e:
        logger.error(f"Error updating player: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== Game Routes ====================

@api_router.post("/games/end", response_model=dict)
async def end_game(game_result: GameResult):
    """Record game result and update player stats - awards gems based on performance"""
    try:
        field_validations = [
            ("wave_reached", game_result.wave_reached, 1, 500),
            ("enemies_killed", game_result.enemies_killed, 0, 50000),
            ("towers_placed", game_result.towers_placed, 0, 1000),
            ("duration_seconds", game_result.duration_seconds, 1, 86400),
            ("coins_earned", game_result.coins_earned, 0, 1000000),
        ]
        for field_name, value, min_value, max_value in field_validations:
            if not isinstance(value, int):
                raise HTTPException(status_code=400, detail=f"{field_name} must be an integer.")
            if value < 0:
                raise HTTPException(status_code=400, detail=f"{field_name} must be non-negative.")
            if value < min_value or value > max_value:
                raise HTTPException(
                    status_code=400,
                    detail=f"{field_name} must be between {min_value} and {max_value}.",
                )

        if (game_result.enemies_killed / game_result.duration_seconds) > 100:
            raise HTTPException(status_code=400, detail="Implausible game session data.")

        where = {"_id": ObjectId(game_result.player_id)} if DB_PROVIDER == "mongo" else {"_id": game_result.player_id}
        player = await repo_find_one("players", where)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        # Calculate XP earned
        xp_earned = (game_result.wave_reached * 10) + game_result.enemies_killed
        
        # Calculate new level
        new_xp = player.get("xp", 0) + xp_earned
        new_level = (new_xp // 100) + 1
        
        # Calculate gem rewards (the new persistent currency)
        gem_reward = calculate_gem_reward(game_result.wave_reached, game_result.enemies_killed)
        run_bonus = max(0, min(int(game_result.run_bonus_gems or 0), 2000))
        last_run_gems = int(gem_reward["total_gems"]) + run_bonus
        new_lifetime_kills = int(player.get("lifetime_enemies_killed", 0)) + int(game_result.enemies_killed)
        lb_score = new_lifetime_kills + last_run_gems
        new_gems = player.get("gems", 0) + gem_reward["total_gems"]
        
        # Check for newly unlocked towers for levels crossed this run.
        tower_unlocks = {
            2: "sniper",
            3: "splash",
            5: "freeze",
            7: "missile",
        }
        old_level = int(player.get("level", 1) or 1)
        current_towers = list(player.get("unlocked_towers", ["machine_gun"]) or ["machine_gun"])
        newly_unlocked = []
        for level_threshold, tower in sorted(tower_unlocks.items()):
            if (old_level + 1) <= level_threshold <= new_level and tower not in current_towers:
                current_towers.append(tower)
                newly_unlocked.append(tower)
        
        best_wave = max(player.get("best_wave", 0), game_result.wave_reached)
        
        update_data = {
            "xp": new_xp,
            "level": new_level,
            "gems": new_gems,
            "total_waves_survived": player.get("total_waves_survived", 0) + game_result.wave_reached,
            "games_played": player.get("games_played", 0) + 1,
            "best_wave": best_wave,
            "lifetime_enemies_killed": new_lifetime_kills,
            "unlocked_towers": current_towers,
            "updated_at": datetime.utcnow()
        }
        
        await repo_update_one("players", where, update_data)
        
        await repo_update_one(
            "leaderboard",
            {"player_id": game_result.player_id},
            {
                "player_id": game_result.player_id,
                "nickname": player.get("nickname", "Player"),
                "best_wave": best_wave,
                "total_waves_survived": update_data["total_waves_survived"],
                "games_played": update_data["games_played"],
                "lifetime_enemies_killed": new_lifetime_kills,
                "last_run_gems": last_run_gems,
                "last_run_enemies_killed": int(game_result.enemies_killed),
                "leaderboard_score": lb_score,
                "updated_at": datetime.utcnow(),
            },
            upsert=True,
        )

        logger.info(
            "leaderboard row upserted after games/end player=%s score=%s wave=%s kills_run=%s",
            game_result.player_id,
            lb_score,
            game_result.wave_reached,
            game_result.enemies_killed,
        )

        return {
            "xp_earned": xp_earned,
            "new_xp": new_xp,
            "new_level": new_level,
            "gems_earned": gem_reward["total_gems"],
            "gem_breakdown": gem_reward,
            "new_gem_balance": new_gems,
            "new_best_wave": best_wave > player.get("best_wave", 0),
            "newly_unlocked_towers": newly_unlocked
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ending game: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== Leaderboard Routes ====================

@api_router.get("/leaderboard", response_model=List[dict])
async def get_leaderboard(limit: int = 100, skip: int = 0):
    """Global leaderboard: lifetime enemies killed + gems earned last run (score), not waves."""
    rows = await repo_leaderboard_fetch_all(2000)
    rows.sort(key=_lb_tuple, reverse=True)
    page = rows[skip : skip + limit]
    return [serialize_doc(e) for e in page]

@api_router.get("/leaderboard/daily", response_model=List[dict])
async def get_daily_challenge_leaderboard(seed: str, limit: int = 100, skip: int = 0):
    """
    Deterministic daily challenge bucket.
    Uses seeded hash over player_id to group global players.
    """
    rows = await repo_leaderboard_fetch_all(2000)
    bucketed = []
    for entry in rows:
        pid = str(entry.get("player_id", ""))
        h = hashlib.sha256(f"{pid}:{seed}".encode("utf-8")).hexdigest()
        if int(h[:8], 16) % 4 == 0:
            bucketed.append(entry)
    bucketed.sort(key=_lb_tuple, reverse=True)
    sliced = bucketed[skip : skip + limit]
    return [serialize_doc(e) for e in sliced]

@api_router.get("/leaderboard/player/{player_id}", response_model=dict)
async def get_player_rank(player_id: str):
    """Rank by lifetime kills + last run gems (same ordering as global list)."""
    rows = await repo_leaderboard_fetch_all(2000)
    rows.sort(key=_lb_tuple, reverse=True)
    idx = next((i for i, e in enumerate(rows) if str(e.get("player_id")) == str(player_id)), -1)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Player not found in leaderboard")
    return {"rank": idx + 1, "entry": serialize_doc(rows[idx])}

# ==================== Reward Routes ====================

@api_router.post("/rewards/claim", response_model=dict)
async def claim_reward(reward: RewardClaim):
    """Claim a reward from watching an ad - now gives gems"""
    try:
        where = {"_id": ObjectId(reward.player_id)} if DB_PROVIDER == "mongo" else {"_id": reward.player_id}
        player = await repo_find_one("players", where)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")

        cooldown_seconds_by_reward = {
            "coins": 30,
            "revive": 60,
            "gems": 30,
            "double_damage": 60,
        }

        if reward.reward_type not in cooldown_seconds_by_reward:
            raise HTTPException(status_code=400, detail="Invalid reward type")

        reward_cooldowns = player.get("reward_cooldowns", {}) or {}
        now = datetime.utcnow()
        last_claimed_raw = reward_cooldowns.get(reward.reward_type)
        if isinstance(last_claimed_raw, str):
            try:
                last_claimed = datetime.fromisoformat(last_claimed_raw.replace("Z", "+00:00"))
                if last_claimed.tzinfo is not None:
                    last_claimed = last_claimed.replace(tzinfo=None)
                elapsed_seconds = (now - last_claimed).total_seconds()
                cooldown_seconds = cooldown_seconds_by_reward[reward.reward_type]
                if elapsed_seconds < cooldown_seconds:
                    remaining_seconds = max(1, int(cooldown_seconds - elapsed_seconds + 0.999))
                    raise HTTPException(
                        status_code=429,
                        detail=f"Reward cooldown active. Try again in {remaining_seconds} seconds.",
                    )
            except ValueError:
                logger.warning("Invalid cooldown timestamp for player=%s reward=%s", reward.player_id, reward.reward_type)
        
        response = {"success": True, "reward_type": reward.reward_type}
        
        if reward.reward_type == "gems":
            gems_granted = 10  # 10 gems per ad watch
            new_gems = player.get("gems", 0) + gems_granted
            reward_cooldowns[reward.reward_type] = now.isoformat()
            await repo_update_one("players", where, {
                "gems": new_gems,
                "reward_cooldowns": reward_cooldowns,
                "updated_at": datetime.utcnow()
            })
            response["gems_granted"] = gems_granted
            response["new_gem_balance"] = new_gems
        elif reward.reward_type == "revive":
            reward_cooldowns[reward.reward_type] = now.isoformat()
            await repo_update_one("players", where, {
                "reward_cooldowns": reward_cooldowns,
                "updated_at": datetime.utcnow()
            })
            response["revive_granted"] = True
        elif reward.reward_type == "double_damage":
            reward_cooldowns[reward.reward_type] = now.isoformat()
            await repo_update_one("players", where, {
                "reward_cooldowns": reward_cooldowns,
                "updated_at": datetime.utcnow()
            })
            response["duration_seconds"] = 30
        elif reward.reward_type == "coins":
            reward_cooldowns[reward.reward_type] = now.isoformat()
            await repo_update_one("players", where, {
                "reward_cooldowns": reward_cooldowns,
                "updated_at": datetime.utcnow()
            })
        
        await repo_insert_one("analytics", {
            "player_id": reward.player_id,
            "event_type": "ad_watched",
            "event_data": {
                "ad_type": reward.ad_type,
                "reward_type": reward.reward_type
            },
            "timestamp": datetime.utcnow()
        })
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error claiming reward: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== Purchase Routes ====================

@api_router.post("/purchases", response_model=dict)
async def process_purchase(purchase: PurchaseRequest):
    """Process an in-app purchase"""
    try:
        platform = (purchase.platform or "").strip().lower()
        receipt_valid = False

        if platform == "ios":
            if not purchase.receipt_data:
                raise HTTPException(status_code=400, detail=INVALID_PURCHASE_RECEIPT_ERROR)
            receipt_valid = await _validate_apple_receipt(purchase.receipt_data)
        elif platform == "android":
            if not purchase.purchase_token or not purchase.item_id:
                raise HTTPException(status_code=400, detail=INVALID_PURCHASE_RECEIPT_ERROR)
            receipt_valid = await _validate_google_purchase(purchase.item_id, purchase.purchase_token)
        else:
            raise HTTPException(status_code=400, detail=INVALID_PURCHASE_RECEIPT_ERROR)

        if not receipt_valid:
            raise HTTPException(status_code=400, detail=INVALID_PURCHASE_RECEIPT_ERROR)

        where = {"_id": ObjectId(purchase.player_id)} if DB_PROVIDER == "mongo" else {"_id": purchase.player_id}
        player = await repo_find_one("players", where)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        update_data = {"updated_at": datetime.utcnow()}
        
        if purchase.item_type == "premium":
            update_data["premium"] = True
        elif purchase.item_type == "arena_expansion":
            update_data["arena_expanded"] = True
        elif purchase.item_type == "gems" and purchase.gems_amount:
            # IAP gem pack purchase - add gems to balance
            new_gems = player.get("gems", 0) + purchase.gems_amount
            update_data["gems"] = new_gems
        elif purchase.item_type == "skin" and purchase.item_id:
            current_skins = player.get("unlocked_skins", ["default"])
            if purchase.item_id not in current_skins:
                current_skins.append(purchase.item_id)
            update_data["unlocked_skins"] = current_skins
        else:
            raise HTTPException(status_code=400, detail="Invalid purchase type")
        
        await repo_update_one("players", where, update_data)
        
        await repo_insert_one("analytics", {
            "player_id": purchase.player_id,
            "event_type": "purchase_completed",
            "event_data": {
                "item_type": purchase.item_type,
                "item_id": purchase.item_id,
                "gems_amount": purchase.gems_amount
            },
            "timestamp": datetime.utcnow()
        })
        
        result = {"success": True, "item_type": purchase.item_type, "item_id": purchase.item_id}
        if "gems" in update_data:
            result["new_gem_balance"] = update_data["gems"]
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing purchase: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== Analytics Routes ====================

@api_router.post("/analytics", response_model=dict)
async def log_analytics(event: AnalyticsEvent):
    """Log an analytics event"""
    try:
        event_doc = event.dict()
        await repo_insert_one("analytics", event_doc)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error logging analytics: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== Skins Routes ====================

@api_router.get("/skins", response_model=List[dict])
async def get_available_skins():
    """Get all available tower skins - priced in gems"""
    skins = [
        {"id": "default", "name": "Default", "price": 0, "price_type": "free", "color": "#4A90D9"},
        {"id": "neon", "name": "Neon", "price": 25, "price_type": "gems", "color": "#00FF88"},
        {"id": "military", "name": "Military", "price": 40, "price_type": "gems", "color": "#4A5D23"},
        {"id": "ice", "name": "Ice", "price": 50, "price_type": "gems", "color": "#00D4FF"},
        {"id": "gold", "name": "Gold", "price": 100, "price_type": "gems", "color": "#FFD700"},
        {"id": "cyber", "name": "Cyber", "price": 2.99, "price_type": "premium", "color": "#FF00FF"},
    ]
    return skins

@api_router.post("/skins/equip", response_model=dict)
async def equip_skin(player_id: str, tower_type: str, skin_id: str):
    """Equip a skin for a tower type"""
    try:
        where = {"_id": ObjectId(player_id)} if DB_PROVIDER == "mongo" else {"_id": player_id}
        player = await repo_find_one("players", where)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        if skin_id not in player.get("unlocked_skins", ["default"]):
            raise HTTPException(status_code=400, detail="Skin not unlocked")
        
        equipped = player.get("equipped_skins", {})
        equipped[tower_type] = skin_id
        
        await repo_update_one("players", where, {"equipped_skins": equipped, "updated_at": datetime.utcnow()})
        
        return {"success": True, "equipped_skins": equipped}
    except Exception as e:
        logger.error(f"Error equipping skin: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/skins/purchase", response_model=dict)
async def purchase_skin(player_id: str, skin_id: str):
    """Purchase a skin with gems"""
    try:
        where = {"_id": ObjectId(player_id)} if DB_PROVIDER == "mongo" else {"_id": player_id}
        player = await repo_find_one("players", where)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        skin_prices = {
            "default": 0,
            "neon": 25,
            "military": 40,
            "ice": 50,
            "gold": 100,
        }
        
        if skin_id not in skin_prices:
            raise HTTPException(status_code=400, detail="Invalid skin or premium skin")
        
        price = skin_prices[skin_id]
        current_gems = player.get("gems", 0)
        
        if current_gems < price:
            raise HTTPException(status_code=400, detail="Not enough gems")
        
        current_skins = player.get("unlocked_skins", ["default"])
        if skin_id in current_skins:
            raise HTTPException(status_code=400, detail="Skin already owned")
        
        current_skins.append(skin_id)
        
        await repo_update_one("players", where, {
            "gems": current_gems - price,
            "unlocked_skins": current_skins,
            "updated_at": datetime.utcnow()
        })
        
        return {
            "success": True,
            "skin_id": skin_id,
            "gems_spent": price,
            "new_gem_balance": current_gems - price
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error purchasing skin: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== Health Check ====================

@api_router.get("/")
async def root():
    return {"message": "Last Stand Defense API", "status": "running"}

@api_router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "db_provider": DB_PROVIDER,
        "environment": ENVIRONMENT,
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=cors_origins != ["*"],
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
