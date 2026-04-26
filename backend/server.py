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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database config (Mongo active, Supabase-ready env supported)
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
    unlocked_towers: List[str] = ["machine_gun"]
    unlocked_skins: List[str] = ["default"]
    equipped_skins: Dict[str, str] = {}
    premium: bool = False
    arena_expanded: bool = False
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
    updated_at: datetime

    class Config:
        populate_by_name = True

class GameResult(BaseModel):
    player_id: str
    wave_reached: int
    enemies_killed: int
    towers_placed: int
    duration_seconds: int

class RewardClaim(BaseModel):
    player_id: str
    reward_type: str  # "gems", "revive", "double_damage"
    ad_type: str  # "rewarded", "interstitial"

class PurchaseRequest(BaseModel):
    player_id: str
    item_type: str  # "premium", "arena_expansion", "skin", "gems"
    item_id: Optional[str] = None
    gems_amount: Optional[int] = None  # for gem pack purchases

class AnalyticsEvent(BaseModel):
    player_id: str
    event_type: str
    event_data: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# ==================== Gem Reward Calculations ====================

def calculate_gem_reward(wave_reached: int, enemies_killed: int) -> dict:
    """Calculate gem rewards based on game performance"""
    # Base: 1 gem per wave survived
    wave_gems = wave_reached
    
    # Bonus: 1 gem per 10 enemies killed
    kill_gems = enemies_killed // 10
    
    # Milestone bonuses: +3 gems at wave 10, 20, 30, etc.
    milestone_gems = (wave_reached // 10) * 3
    
    total = wave_gems + kill_gems + milestone_gems
    
    return {
        "wave_gems": wave_gems,
        "kill_gems": kill_gems,
        "milestone_gems": milestone_gems,
        "total_gems": total,
    }

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
        "unlocked_towers": ["machine_gun"],
        "unlocked_skins": ["default"],
        "equipped_skins": {},
        "premium": False,
        "arena_expansions": 0,
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
        new_gems = player.get("gems", 0) + gem_reward["total_gems"]
        
        # Check for new tower unlocks based on level
        tower_unlocks = {
            3: "sniper",
            5: "splash",
            8: "freeze",
            12: "missile"
        }
        
        current_towers = player.get("unlocked_towers", ["machine_gun"])
        for level, tower in tower_unlocks.items():
            if new_level >= level and tower not in current_towers:
                current_towers.append(tower)
        
        best_wave = max(player.get("best_wave", 0), game_result.wave_reached)
        
        update_data = {
            "xp": new_xp,
            "level": new_level,
            "gems": new_gems,
            "total_waves_survived": player.get("total_waves_survived", 0) + game_result.wave_reached,
            "games_played": player.get("games_played", 0) + 1,
            "best_wave": best_wave,
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
                "updated_at": datetime.utcnow(),
            },
            upsert=True,
        )
        
        newly_unlocked = [t for t in current_towers if t not in player.get("unlocked_towers", [])]
        
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
    except Exception as e:
        logger.error(f"Error ending game: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== Leaderboard Routes ====================

@api_router.get("/leaderboard", response_model=List[dict])
async def get_leaderboard(limit: int = 100, skip: int = 0):
    """Get global leaderboard sorted by best wave"""
    entries = await repo_find_many("leaderboard", "best_wave", True, skip, limit)
    return [serialize_doc(e) for e in entries]

@api_router.get("/leaderboard/daily", response_model=List[dict])
async def get_daily_challenge_leaderboard(seed: str, limit: int = 100, skip: int = 0):
    """
    Deterministic daily challenge bucket.
    Uses seeded hash over player_id to group global players.
    """
    entries = await repo_find_many("leaderboard", "best_wave", True, 0, 500, max_len=500)
    bucketed = []
    for entry in entries:
      pid = str(entry.get("player_id", ""))
      h = hashlib.sha256(f"{pid}:{seed}".encode("utf-8")).hexdigest()
      if int(h[:8], 16) % 4 == 0:
        bucketed.append(entry)
    sliced = bucketed[skip: skip + limit]
    return [serialize_doc(e) for e in sliced]

@api_router.get("/leaderboard/player/{player_id}", response_model=dict)
async def get_player_rank(player_id: str):
    """Get a player's rank and surrounding players"""
    all_entries = await repo_find_many("leaderboard", "best_wave", True, 0, 500, max_len=500)
    player_rows = [e for e in all_entries if str(e.get("player_id")) == str(player_id)]
    if not player_rows:
        raise HTTPException(status_code=404, detail="Player not found in leaderboard")

    player_entry = max(
        player_rows,
        key=lambda e: (int(e.get("best_wave", 0)), int(e.get("total_waves_survived", 0)))
    )
    rank = await repo_count_gt("leaderboard", "best_wave", player_entry["best_wave"])
    rank += 1
    
    return {
        "rank": rank,
        "entry": serialize_doc(player_entry)
    }

# ==================== Reward Routes ====================

@api_router.post("/rewards/claim", response_model=dict)
async def claim_reward(reward: RewardClaim):
    """Claim a reward from watching an ad - now gives gems"""
    try:
        where = {"_id": ObjectId(reward.player_id)} if DB_PROVIDER == "mongo" else {"_id": reward.player_id}
        player = await repo_find_one("players", where)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        response = {"success": True, "reward_type": reward.reward_type}
        
        if reward.reward_type == "gems":
            gems_granted = 10  # 10 gems per ad watch
            new_gems = player.get("gems", 0) + gems_granted
            await repo_update_one("players", where, {"gems": new_gems, "updated_at": datetime.utcnow()})
            response["gems_granted"] = gems_granted
            response["new_gem_balance"] = new_gems
        elif reward.reward_type == "revive":
            response["revive_granted"] = True
        elif reward.reward_type == "double_damage":
            response["duration_seconds"] = 30
        
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
    except Exception as e:
        logger.error(f"Error claiming reward: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ==================== Purchase Routes ====================

@api_router.post("/purchases", response_model=dict)
async def process_purchase(purchase: PurchaseRequest):
    """Process an in-app purchase"""
    try:
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
    return {"status": "healthy", "db_provider": DB_PROVIDER}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
