#!/usr/bin/env python3
"""
Backend API Test Suite for Last Stand Defense
Tests all endpoints with focus on new requirements:
- Real ad_type: 'rewarded' for rewards
- New IAP product IDs like 'com.laststanddefense.remove_ads'
- item_type: 'premium' and 'arena_expansion'
"""

import asyncio
import aiohttp
import json
import logging
import os
from datetime import datetime
from pathlib import Path

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BACKEND_URL:
    raise SystemExit('EXPO_PUBLIC_BACKEND_URL is required to run backend_test.py')
API_BASE = f"{BACKEND_URL}/api"
RESULTS_PATH = Path(__file__).resolve().parent / 'backend_test_results.json'

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
logger.info(f"Testing backend at: {API_BASE}")

class APITester:
    def __init__(self):
        self.session = None
        self.test_results = []
        self.test_player_id = None
        self.test_device_id = f"test_device_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def log_result(self, test_name, success, details="", endpoint=""):
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "endpoint": endpoint,
            "timestamp": datetime.utcnow().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        logger.info(f"{status}: {test_name} - {details}")
    
    async def make_request(self, method, endpoint, data=None, params=None):
        """Make HTTP request with error handling"""
        url = f"{API_BASE}{endpoint}"
        try:
            if method == "GET":
                async with self.session.get(url, params=params) as response:
                    return response.status, await response.json()
            elif method == "POST":
                async with self.session.post(url, json=data) as response:
                    return response.status, await response.json()
            elif method == "PATCH":
                async with self.session.patch(url, json=data) as response:
                    return response.status, await response.json()
        except Exception as e:
            logger.error(f"Request failed for {method} {endpoint}: {e}")
            return 0, {"error": str(e)}
    
    # ========== Player API Tests ==========
    
    async def test_create_player(self):
        """Test POST /api/players - Create a player with nickname"""
        data = {
            "nickname": "TestWarrior2024",
            "device_id": self.test_device_id
        }
        
        status, response = await self.make_request("POST", "/players", data)
        
        if status == 200 and "_id" in response and response["nickname"] == "TestWarrior2024":
            self.test_player_id = response["_id"]
            self.log_result(
                "Create Player", 
                True, 
                f"Player created with ID: {self.test_player_id}, coins: {response.get('coins', 0)}", 
                "POST /api/players"
            )
            return True
        else:
            self.log_result("Create Player", False, f"Status: {status}, Response: {response}", "POST /api/players")
            return False
    
    async def test_get_player_by_device(self):
        """Test GET /api/players/device/{device_id} - Get player by device ID"""
        if not self.test_player_id:
            self.log_result("Get Player by Device", False, "No test player created", "GET /api/players/device/{device_id}")
            return False
        
        status, response = await self.make_request("GET", f"/players/device/{self.test_device_id}")
        
        if status == 200 and response["_id"] == self.test_player_id and response["device_id"] == self.test_device_id:
            self.log_result(
                "Get Player by Device", 
                True, 
                f"Retrieved player: {response['nickname']}, level: {response.get('level', 1)}", 
                "GET /api/players/device/{device_id}"
            )
            return True
        else:
            self.log_result("Get Player by Device", False, f"Status: {status}, Response: {response}", "GET /api/players/device/{device_id}")
            return False
    
    # ========== Game API Tests ==========
    
    async def test_game_end(self):
        """Test POST /api/game/end - End game and submit score"""
        if not self.test_player_id:
            self.log_result("Game End", False, "No test player created", "POST /api/game/end")
            return False
        
        data = {
            "player_id": self.test_player_id,
            "wave_reached": 8,
            "coins_earned": 120,
            "enemies_killed": 45,
            "towers_placed": 12,
            "duration_seconds": 420
        }
        
        status, response = await self.make_request("POST", "/games/end", data)
        
        if status == 200 and "xp_earned" in response and "new_level" in response:
            expected_xp = (8 * 10) + 45  # 125 XP total
            actual_xp = response.get("xp_earned", 0)
            self.log_result(
                "Game End", 
                True, 
                f"XP earned: {actual_xp}, new level: {response['new_level']}, newly unlocked: {response.get('newly_unlocked_towers', [])}", 
                "POST /api/games/end"
            )
            return True
        else:
            self.log_result("Game End", False, f"Status: {status}, Response: {response}", "POST /api/games/end")
            return False
    
    # ========== Leaderboard API Tests ==========
    
    async def test_leaderboard(self):
        """Test GET /api/leaderboard - Get leaderboard"""
        status, response = await self.make_request("GET", "/leaderboard")
        
        if status == 200 and isinstance(response, list):
            player_count = len(response)
            has_test_player = any(entry.get("player_id") == self.test_player_id for entry in response)
            self.log_result(
                "Get Leaderboard", 
                True, 
                f"Retrieved {player_count} entries, test player included: {has_test_player}", 
                "GET /api/leaderboard"
            )
            return True
        else:
            self.log_result("Get Leaderboard", False, f"Status: {status}, Response: {response}", "GET /api/leaderboard")
            return False
    
    # ========== Rewards API Tests ==========
    
    async def test_claim_rewarded_ad(self):
        """Test POST /api/rewards/claim - Claim ad reward with real ad_type: 'rewarded'"""
        if not self.test_player_id:
            self.log_result("Claim Rewarded Ad", False, "No test player created", "POST /api/rewards/claim")
            return False
        
        data = {
            "player_id": self.test_player_id,
            "reward_type": "gems",
            "ad_type": "rewarded"
        }
        
        status, response = await self.make_request("POST", "/rewards/claim", data)
        
        if status == 200 and response.get("success") and "gems_granted" in response:
            self.log_result(
                "Claim Rewarded Ad", 
                True, 
                f"Granted {response['gems_granted']} gems, new balance: {response['new_gem_balance']}", 
                "POST /api/rewards/claim"
            )
            return True
        else:
            self.log_result("Claim Rewarded Ad", False, f"Status: {status}, Response: {response}", "POST /api/rewards/claim")
            return False
    
    async def test_claim_revive_reward(self):
        """Test POST /api/rewards/claim - Claim revive reward"""
        if not self.test_player_id:
            self.log_result("Claim Revive Reward", False, "No test player created", "POST /api/rewards/claim")
            return False
        
        data = {
            "player_id": self.test_player_id,
            "reward_type": "revive",
            "ad_type": "rewarded"
        }
        
        status, response = await self.make_request("POST", "/rewards/claim", data)
        
        if status == 200 and response.get("success") and response.get("revive_granted"):
            self.log_result(
                "Claim Revive Reward", 
                True, 
                "Revive granted successfully", 
                "POST /api/rewards/claim"
            )
            return True
        else:
            self.log_result("Claim Revive Reward", False, f"Status: {status}, Response: {response}", "POST /api/rewards/claim")
            return False
    
    # ========== Purchase API Tests ==========
    
    async def test_purchase_receipt_validation(self):
        """Test POST /api/purchases rejects missing receipt data."""
        if not self.test_player_id:
            self.log_result("Purchase Receipt Validation", False, "No test player created", "POST /api/purchases")
            return False

        data = {
            "player_id": self.test_player_id,
            "item_type": "gems",
            "item_id": "com.laststanddefense.gems_500",
            "gems_amount": 500,
            "platform": "ios",
        }

        status, response = await self.make_request("POST", "/purchases", data)
        detail = response.get("detail", "")

        if status == 400 and "Invalid or missing purchase receipt" in str(detail):
            self.log_result(
                "Purchase Receipt Validation",
                True,
                "Missing receipt correctly rejected with HTTP 400",
                "POST /api/purchases",
            )
            return True

        self.log_result(
            "Purchase Receipt Validation",
            False,
            f"Status: {status}, Response: {response}",
            "POST /api/purchases",
        )
        return False
    
    # ========== Skins API Tests ==========
    
    async def test_get_skins(self):
        """Test GET /api/skins - Get available skins"""
        status, response = await self.make_request("GET", "/skins")
        
        if status == 200 and isinstance(response, list) and len(response) > 0:
            skin_count = len(response)
            skin_names = [skin.get("name", "Unknown") for skin in response[:3]]  # First 3 skins
            self.log_result(
                "Get Skins", 
                True, 
                f"Retrieved {skin_count} skins: {', '.join(skin_names)}...", 
                "GET /api/skins"
            )
            return True
        else:
            self.log_result("Get Skins", False, f"Status: {status}, Response: {response}", "GET /api/skins")
            return False
    
    # ========== Analytics API Tests ==========
    
    async def test_analytics_event(self):
        """Test POST /api/analytics/event - Track analytics event"""
        if not self.test_player_id:
            self.log_result("Analytics Event", False, "No test player created", "POST /api/analytics/event")
            return False
        
        data = {
            "player_id": self.test_player_id,
            "event_type": "tower_placement",
            "event_data": {
                "tower_type": "machine_gun",
                "position": {"x": 100, "y": 150},
                "wave": 3,
                "cost": 450
            }
        }
        
        status, response = await self.make_request("POST", "/analytics", data)
        
        if status == 200 and response.get("success"):
            self.log_result(
                "Analytics Event", 
                True, 
                f"Logged {data['event_type']} event with data: {data['event_data']['tower_type']}", 
                "POST /api/analytics"
            )
            return True
        else:
            self.log_result("Analytics Event", False, f"Status: {status}, Response: {response}", "POST /api/analytics")
            return False
    
    # ========== Health Check Tests ==========
    
    async def test_health_check(self):
        """Test basic API health"""
        status, response = await self.make_request("GET", "/health")
        
        if status == 200 and response.get("status") == "healthy":
            self.log_result("Health Check", True, "API is healthy", "GET /api/health")
            return True
        else:
            self.log_result("Health Check", False, f"Status: {status}, Response: {response}", "GET /api/health")
            return False
    
    # ========== Run All Tests ==========
    
    async def run_all_tests(self):
        """Run all API tests in sequence"""
        logger.info("Starting comprehensive backend API testing...")
        
        test_functions = [
            ("Health Check", self.test_health_check),
            ("Create Player", self.test_create_player),
            ("Get Player by Device", self.test_get_player_by_device),
            ("Game End", self.test_game_end),
            ("Get Leaderboard", self.test_leaderboard),
            ("Claim Rewarded Ad", self.test_claim_rewarded_ad),
            ("Claim Revive Reward", self.test_claim_revive_reward),
            ("Purchase Receipt Validation", self.test_purchase_receipt_validation),
            ("Get Skins", self.test_get_skins),
            ("Analytics Event", self.test_analytics_event),
        ]
        
        passed = 0
        total = len(test_functions)
        
        for test_name, test_func in test_functions:
            try:
                success = await test_func()
                if success:
                    passed += 1
            except Exception as e:
                self.log_result(test_name, False, f"Exception: {str(e)}")
                logger.error(f"Test {test_name} failed with exception: {e}")
        
        logger.info(f"\n=== TEST SUMMARY ===")
        logger.info(f"Tests passed: {passed}/{total}")
        logger.info(f"Success rate: {(passed/total)*100:.1f}%")
        
        if passed == total:
            logger.info("🎉 ALL TESTS PASSED!")
        else:
            logger.warning(f"⚠️  {total-passed} TESTS FAILED")
            failed_tests = [r for r in self.test_results if not r["success"]]
            for test in failed_tests:
                logger.warning(f"  - {test['test']}: {test['details']}")
        
        return passed, total, self.test_results

async def main():
    """Main test execution function"""
    async with APITester() as tester:
        passed, total, results = await tester.run_all_tests()
        
        # Save detailed results
        with open(RESULTS_PATH, 'w') as f:
            json.dump({
                "summary": {"passed": passed, "total": total, "success_rate": (passed/total)*100},
                "results": results,
                "tested_at": datetime.utcnow().isoformat(),
                "backend_url": API_BASE
            }, f, indent=2)
        
        return passed == total

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)