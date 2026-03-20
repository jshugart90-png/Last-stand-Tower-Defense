from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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
    doc["_id"] = str(doc["_id"])
    return doc

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
    existing = await db.players.find_one({"device_id": player_data.device_id})
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
    
    result = await db.players.insert_one(player_doc)
    player_doc["_id"] = str(result.inserted_id)
    
    await db.leaderboard.insert_one({
        "player_id": str(result.inserted_id),
        "nickname": player_data.nickname,
        "best_wave": 0,
        "total_waves_survived": 0,
        "games_played": 0,
        "updated_at": datetime.utcnow()
    })
    
    return player_doc

@api_router.get("/players/{player_id}", response_model=dict)
async def get_player(player_id: str):
    """Get player by ID"""
    try:
        player = await db.players.find_one({"_id": ObjectId(player_id)})
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        return serialize_doc(player)
    except Exception as e:
        logger.error(f"Error getting player: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/players/device/{device_id}", response_model=dict)
async def get_player_by_device(device_id: str):
    """Get player by device ID"""
    player = await db.players.find_one({"device_id": device_id})
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return serialize_doc(player)

@api_router.patch("/players/{player_id}", response_model=dict)
async def update_player(player_id: str, update_data: PlayerUpdate):
    """Update player data"""
    try:
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await db.players.find_one_and_update(
            {"_id": ObjectId(player_id)},
            {"$set": update_dict},
            return_document=True
        )
        
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
        player = await db.players.find_one({"_id": ObjectId(game_result.player_id)})
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
        
        await db.players.update_one(
            {"_id": ObjectId(game_result.player_id)},
            {"$set": update_data}
        )
        
        await db.leaderboard.update_one(
            {"player_id": game_result.player_id},
            {"$set": {
                "best_wave": best_wave,
                "total_waves_survived": update_data["total_waves_survived"],
                "games_played": update_data["games_played"],
                "updated_at": datetime.utcnow()
            }},
            upsert=True
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
    entries = await db.leaderboard.find().sort("best_wave", -1).skip(skip).limit(limit).to_list(limit)
    return [serialize_doc(e) for e in entries]

@api_router.get("/leaderboard/player/{player_id}", response_model=dict)
async def get_player_rank(player_id: str):
    """Get a player's rank and surrounding players"""
    player_entry = await db.leaderboard.find_one({"player_id": player_id})
    if not player_entry:
        raise HTTPException(status_code=404, detail="Player not found in leaderboard")
    
    rank = await db.leaderboard.count_documents({"best_wave": {"$gt": player_entry["best_wave"]}})
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
        player = await db.players.find_one({"_id": ObjectId(reward.player_id)})
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        response = {"success": True, "reward_type": reward.reward_type}
        
        if reward.reward_type == "gems":
            gems_granted = 10  # 10 gems per ad watch
            new_gems = player.get("gems", 0) + gems_granted
            await db.players.update_one(
                {"_id": ObjectId(reward.player_id)},
                {"$set": {"gems": new_gems, "updated_at": datetime.utcnow()}}
            )
            response["gems_granted"] = gems_granted
            response["new_gem_balance"] = new_gems
        elif reward.reward_type == "revive":
            response["revive_granted"] = True
        elif reward.reward_type == "double_damage":
            response["duration_seconds"] = 30
        
        await db.analytics.insert_one({
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
        player = await db.players.find_one({"_id": ObjectId(purchase.player_id)})
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
        
        await db.players.update_one(
            {"_id": ObjectId(purchase.player_id)},
            {"$set": update_data}
        )
        
        await db.analytics.insert_one({
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
        await db.analytics.insert_one(event_doc)
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
        player = await db.players.find_one({"_id": ObjectId(player_id)})
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        if skin_id not in player.get("unlocked_skins", ["default"]):
            raise HTTPException(status_code=400, detail="Skin not unlocked")
        
        equipped = player.get("equipped_skins", {})
        equipped[tower_type] = skin_id
        
        await db.players.update_one(
            {"_id": ObjectId(player_id)},
            {"$set": {"equipped_skins": equipped, "updated_at": datetime.utcnow()}}
        )
        
        return {"success": True, "equipped_skins": equipped}
    except Exception as e:
        logger.error(f"Error equipping skin: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/skins/purchase", response_model=dict)
async def purchase_skin(player_id: str, skin_id: str):
    """Purchase a skin with gems"""
    try:
        player = await db.players.find_one({"_id": ObjectId(player_id)})
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
        
        await db.players.update_one(
            {"_id": ObjectId(player_id)},
            {"$set": {
                "gems": current_gems - price,
                "unlocked_skins": current_skins,
                "updated_at": datetime.utcnow()
            }}
        )
        
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
    return {"status": "healthy"}

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
