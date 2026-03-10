#!/usr/bin/env python3
"""
Last Stand Defense Backend API Test Suite
Tests all backend endpoints for the tower defense game.
"""

import asyncio
import aiohttp
import json
import sys
import time
from datetime import datetime
from typing import Optional, Dict, Any

# Backend URL from environment configuration
BACKEND_URL = "https://tower-defense-game-22.preview.emergentagent.com/api"

class GameAPITester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = None
        self.test_player_id = None
        self.results = {
            "passed": 0,
            "failed": 0,
            "errors": [],
            "player_id": None
        }

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def log_success(self, test_name: str, response_data: Any = None):
        """Log successful test"""
        self.results["passed"] += 1
        print(f"✅ {test_name}")
        if response_data:
            print(f"   Response: {json.dumps(response_data, indent=2)}")

    def log_failure(self, test_name: str, error: str, response_data: Any = None):
        """Log failed test"""
        self.results["failed"] += 1
        self.results["errors"].append(f"{test_name}: {error}")
        print(f"❌ {test_name}: {error}")
        if response_data:
            print(f"   Response: {json.dumps(response_data, indent=2)}")

    async def make_request(self, method: str, endpoint: str, **kwargs) -> tuple[int, Any]:
        """Make HTTP request and return status code and response data"""
        url = f"{self.base_url}{endpoint}"
        try:
            async with self.session.request(method, url, **kwargs) as response:
                try:
                    data = await response.json()
                except:
                    data = await response.text()
                return response.status, data
        except Exception as e:
            return 0, f"Connection error: {str(e)}"

    async def test_player_apis(self):
        """Test all Player CRUD APIs"""
        print("\n🔍 Testing Player APIs...")
        
        # Test 1: Create Player
        player_data = {
            "nickname": "GameTester2024",
            "device_id": "test-device-12345"
        }
        
        status, response = await self.make_request("POST", "/players", json=player_data)
        
        if status == 200 and response.get("_id"):
            self.test_player_id = response["_id"]
            self.results["player_id"] = self.test_player_id
            self.log_success("Create Player", {"player_id": self.test_player_id, "nickname": response.get("nickname")})
        else:
            self.log_failure("Create Player", f"Status: {status}", response)
            return False

        # Test 2: Get Player by ID
        status, response = await self.make_request("GET", f"/players/{self.test_player_id}")
        
        if status == 200 and response.get("_id") == self.test_player_id:
            self.log_success("Get Player by ID", {"nickname": response.get("nickname"), "coins": response.get("coins")})
        else:
            self.log_failure("Get Player by ID", f"Status: {status}", response)

        # Test 3: Get Player by Device ID
        status, response = await self.make_request("GET", f"/players/device/{player_data['device_id']}")
        
        if status == 200 and response.get("device_id") == player_data["device_id"]:
            self.log_success("Get Player by Device ID", {"device_id": response.get("device_id")})
        else:
            self.log_failure("Get Player by Device ID", f"Status: {status}", response)

        # Test 4: Update Player
        update_data = {"coins": 500}
        status, response = await self.make_request("PATCH", f"/players/{self.test_player_id}", json=update_data)
        
        if status == 200 and response.get("coins") == 500:
            self.log_success("Update Player", {"new_coins": response.get("coins")})
        else:
            self.log_failure("Update Player", f"Status: {status}", response)

        return True

    async def test_game_api(self):
        """Test Game End API"""
        print("\n🎮 Testing Game APIs...")
        
        if not self.test_player_id:
            self.log_failure("Game End API", "No test player available")
            return

        game_result = {
            "player_id": self.test_player_id,
            "wave_reached": 5,
            "coins_earned": 100,
            "enemies_killed": 25,
            "towers_placed": 3,
            "duration_seconds": 120
        }

        status, response = await self.make_request("POST", "/games/end", json=game_result)
        
        if status == 200 and "xp_earned" in response:
            self.log_success("Game End API", {
                "xp_earned": response.get("xp_earned"),
                "new_level": response.get("new_level"),
                "coins_earned": response.get("coins_earned"),
                "newly_unlocked_towers": response.get("newly_unlocked_towers", [])
            })
        else:
            self.log_failure("Game End API", f"Status: {status}", response)

    async def test_leaderboard_apis(self):
        """Test Leaderboard APIs"""
        print("\n🏆 Testing Leaderboard APIs...")
        
        # Test 1: Get Global Leaderboard
        status, response = await self.make_request("GET", "/leaderboard")
        
        if status == 200 and isinstance(response, list):
            self.log_success("Global Leaderboard", {"entries_count": len(response)})
        else:
            self.log_failure("Global Leaderboard", f"Status: {status}", response)

        # Test 2: Get Player Rank
        if self.test_player_id:
            status, response = await self.make_request("GET", f"/leaderboard/player/{self.test_player_id}")
            
            if status == 200 and "rank" in response:
                self.log_success("Player Rank", {"rank": response.get("rank")})
            else:
                self.log_failure("Player Rank", f"Status: {status}", response)

    async def test_reward_api(self):
        """Test Reward Claim API"""
        print("\n🎁 Testing Reward APIs...")
        
        if not self.test_player_id:
            self.log_failure("Reward Claim API", "No test player available")
            return

        reward_data = {
            "player_id": self.test_player_id,
            "reward_type": "coins",
            "ad_type": "rewarded"
        }

        status, response = await self.make_request("POST", "/rewards/claim", json=reward_data)
        
        if status == 200 and response.get("success"):
            self.log_success("Reward Claim API", {
                "reward_type": response.get("reward_type"),
                "coins_granted": response.get("coins_granted"),
                "new_balance": response.get("new_balance")
            })
        else:
            self.log_failure("Reward Claim API", f"Status: {status}", response)

    async def test_purchase_apis(self):
        """Test Purchase APIs"""
        print("\n💰 Testing Purchase APIs...")
        
        if not self.test_player_id:
            self.log_failure("Purchase APIs", "No test player available")
            return

        # Test 1: Premium Purchase
        purchase_data = {
            "player_id": self.test_player_id,
            "item_type": "premium"
        }

        status, response = await self.make_request("POST", "/purchases", json=purchase_data)
        
        if status == 200 and response.get("success"):
            self.log_success("Premium Purchase", {"item_type": response.get("item_type")})
        else:
            self.log_failure("Premium Purchase", f"Status: {status}", response)

        # Test 2: Arena Expansion Purchase
        arena_purchase = {
            "player_id": self.test_player_id,
            "item_type": "arena_expansion"
        }

        status, response = await self.make_request("POST", "/purchases", json=arena_purchase)
        
        if status == 200 and response.get("success"):
            self.log_success("Arena Expansion Purchase", {"item_type": response.get("item_type")})
        else:
            self.log_failure("Arena Expansion Purchase", f"Status: {status}", response)

    async def test_skins_apis(self):
        """Test Skins APIs"""
        print("\n🎨 Testing Skins APIs...")
        
        # Test 1: Get All Skins
        status, response = await self.make_request("GET", "/skins")
        
        if status == 200 and isinstance(response, list):
            available_skins = [skin["id"] for skin in response if skin["price_type"] == "coins"]
            self.log_success("Get All Skins", {"skins_count": len(response), "coin_skins": available_skins})
        else:
            self.log_failure("Get All Skins", f"Status: {status}", response)
            return

        if not self.test_player_id:
            self.log_failure("Skins Purchase/Equip", "No test player available")
            return

        # Test 2: Purchase Skin
        purchase_params = {
            "player_id": self.test_player_id,
            "skin_id": "neon"
        }

        status, response = await self.make_request("POST", "/skins/purchase", params=purchase_params)
        
        if status == 200 and response.get("success"):
            self.log_success("Purchase Skin", {
                "skin_id": response.get("skin_id"),
                "coins_spent": response.get("coins_spent"),
                "new_balance": response.get("new_balance")
            })
        else:
            self.log_failure("Purchase Skin", f"Status: {status}", response)

        # Test 3: Equip Skin
        equip_params = {
            "player_id": self.test_player_id,
            "tower_type": "machine_gun",
            "skin_id": "neon"
        }

        status, response = await self.make_request("POST", "/skins/equip", params=equip_params)
        
        if status == 200 and response.get("success"):
            self.log_success("Equip Skin", {"equipped_skins": response.get("equipped_skins")})
        else:
            self.log_failure("Equip Skin", f"Status: {status}", response)

    async def test_analytics_api(self):
        """Test Analytics API"""
        print("\n📊 Testing Analytics APIs...")
        
        if not self.test_player_id:
            self.log_failure("Analytics API", "No test player available")
            return

        analytics_data = {
            "player_id": self.test_player_id,
            "event_type": "game_start",
            "event_data": {"test_mode": True}
        }

        status, response = await self.make_request("POST", "/analytics", json=analytics_data)
        
        if status == 200 and response.get("success"):
            self.log_success("Analytics API", {"event_logged": True})
        else:
            self.log_failure("Analytics API", f"Status: {status}", response)

    async def test_health_endpoints(self):
        """Test Health Check endpoints"""
        print("\n❤️ Testing Health Check APIs...")
        
        # Test root endpoint
        status, response = await self.make_request("GET", "/")
        
        if status == 200 and "Last Stand Defense API" in str(response):
            self.log_success("Root Health Check", response)
        else:
            self.log_failure("Root Health Check", f"Status: {status}", response)

        # Test health endpoint
        status, response = await self.make_request("GET", "/health")
        
        if status == 200 and response.get("status") == "healthy":
            self.log_success("Health Check", response)
        else:
            self.log_failure("Health Check", f"Status: {status}", response)

    async def run_all_tests(self):
        """Run all API tests"""
        print(f"🚀 Starting Last Stand Defense API Tests")
        print(f"   Backend URL: {self.base_url}")
        print(f"   Timestamp: {datetime.now().isoformat()}")
        
        # Test in logical order
        await self.test_health_endpoints()
        
        # Player tests must come first to create test player
        success = await self.test_player_apis()
        if not success:
            print("\n⚠️ Stopping tests due to player creation failure")
            return self.results
        
        # Test all other APIs
        await self.test_game_api()
        await self.test_leaderboard_apis()
        await self.test_reward_api()
        await self.test_purchase_apis()
        await self.test_skins_apis()
        await self.test_analytics_api()

        return self.results

async def main():
    """Main test execution"""
    try:
        async with GameAPITester(BACKEND_URL) as tester:
            results = await tester.run_all_tests()
            
            print(f"\n" + "="*60)
            print(f"📊 TEST RESULTS SUMMARY")
            print(f"="*60)
            print(f"✅ Passed: {results['passed']}")
            print(f"❌ Failed: {results['failed']}")
            print(f"🆔 Test Player ID: {results['player_id']}")
            
            if results['errors']:
                print(f"\n🔍 FAILED TESTS:")
                for error in results['errors']:
                    print(f"   • {error}")
            
            print(f"\n{'🎉 ALL TESTS PASSED!' if results['failed'] == 0 else '⚠️ SOME TESTS FAILED'}")
            
            # Exit with error code if any tests failed
            sys.exit(0 if results['failed'] == 0 else 1)
            
    except Exception as e:
        print(f"❌ Test execution failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())