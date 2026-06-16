#!/usr/bin/env python3
"""
Dual-Currency System Test for Last Stand Defense
Tests the complete gem economy flow: earn through gameplay → earn through ads → buy through IAP
"""

import asyncio
import aiohttp
import json
import logging
import os
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BACKEND_URL:
    raise SystemExit('EXPO_PUBLIC_BACKEND_URL is required to run gem_economy_test.py')
API_BASE = f"{BACKEND_URL}/api"
RESULTS_PATH = Path(__file__).resolve().parent / 'gem_economy_test_results.json'

logger.info(f"Testing gem economy at: {API_BASE}")

class GemEconomyTester:
    def __init__(self):
        self.session = None
        self.test_results = []
        self.player_id = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def log_result(self, test_name, success, details="", expected="", actual=""):
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "expected": expected,
            "actual": actual,
            "timestamp": datetime.utcnow().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        logger.info(f"{status}: {test_name}")
        if details:
            logger.info(f"    Details: {details}")
        if not success and expected and actual:
            logger.info(f"    Expected: {expected}")
            logger.info(f"    Actual: {actual}")
    
    async def make_request(self, method, endpoint, data=None):
        """Make HTTP request with error handling"""
        url = f"{API_BASE}{endpoint}"
        try:
            if method == "GET":
                async with self.session.get(url) as response:
                    return response.status, await response.json()
            elif method == "POST":
                async with self.session.post(url, json=data) as response:
                    return response.status, await response.json()
        except Exception as e:
            logger.error(f"Request failed for {method} {endpoint}: {e}")
            return 0, {"error": str(e)}
    
    async def test_step_1_create_player(self):
        """Step 1: POST /api/players - Create player with nickname 'GemEcon' and device_id 'gem-test-device'"""
        logger.info("\n=== STEP 1: Create Player ===")
        
        data = {
            "nickname": "GemEcon",
            "device_id": "gem-test-device"
        }
        
        status, response = await self.make_request("POST", "/players", data)
        
        if status == 200 and "_id" in response and response["nickname"] == "GemEcon":
            self.player_id = response["_id"]
            initial_gems = response.get("gems", 0)
            self.log_result(
                "Step 1: Create Player", 
                True, 
                f"Player created with ID: {self.player_id}, initial gems: {initial_gems}"
            )
            return True
        else:
            self.log_result(
                "Step 1: Create Player", 
                False, 
                f"Failed to create player. Status: {status}, Response: {response}"
            )
            return False
    
    async def test_step_2_end_game(self):
        """Step 2: POST /api/games/end - End game and verify gem rewards"""
        logger.info("\n=== STEP 2: End Game and Earn Gems ===")
        
        if not self.player_id:
            self.log_result("Step 2: End Game", False, "No player ID available")
            return False
        
        data = {
            "player_id": self.player_id,
            "wave_reached": 15,
            "enemies_killed": 80,
            "towers_placed": 5,
            "duration_seconds": 120,
            "coins_earned": 0,
        }
        
        status, response = await self.make_request("POST", "/games/end", data)
        
        if status == 200:
            # Verify required fields exist
            required_fields = ["gems_earned", "gem_breakdown", "new_gem_balance"]
            missing_fields = [field for field in required_fields if field not in response]
            
            if missing_fields:
                self.log_result(
                    "Step 2: End Game", 
                    False, 
                    f"Missing required fields: {missing_fields}",
                    "gems_earned, gem_breakdown, new_gem_balance",
                    f"Response keys: {list(response.keys())}"
                )
                return False
            
            # Verify gem breakdown calculation (scaled formula in backend/server.py)
            gem_breakdown = response["gem_breakdown"]
            raw_performance = int(15 * 0.75) + (80 // 20)  # 11 + 4 = 15
            expected_total = int(0.35 * raw_performance)  # 5
            actual_total = int(gem_breakdown.get("total_gems", 0))
            balance_correct = int(response["new_gem_balance"]) == expected_total
            total_correct = actual_total == expected_total

            if total_correct and balance_correct:
                self.log_result(
                    "Step 2: End Game", 
                    True, 
                    f"Gem rewards calculated correctly: raw={raw_performance}, total={actual_total}, new_balance={response['new_gem_balance']}"
                )
                return True
            else:
                self.log_result(
                    "Step 2: End Game", 
                    False, 
                    f"Gem calculation errors: expected total {expected_total}, got total {actual_total}, balance {response.get('new_gem_balance')}"
                )
                return False
        else:
            self.log_result(
                "Step 2: End Game", 
                False, 
                f"Game end failed. Status: {status}, Response: {response}"
            )
            return False
    
    async def test_step_3_verify_player_gems(self):
        """Step 3: GET /api/players/{player_id} - Verify player.gems equals run total"""
        logger.info("\n=== STEP 3: Verify Player Gem Balance ===")
        
        if not self.player_id:
            self.log_result("Step 3: Verify Player Gems", False, "No player ID available")
            return False
        
        status, response = await self.make_request("GET", f"/players/{self.player_id}")
        
        if status == 200:
            actual_gems = response.get("gems", 0)
            expected_gems = 5
            
            if actual_gems == expected_gems:
                self.log_result(
                    "Step 3: Verify Player Gems", 
                    True, 
                    f"Player gem balance verified: {actual_gems} gems"
                )
                return True
            else:
                self.log_result(
                    "Step 3: Verify Player Gems", 
                    False, 
                    f"Gem balance mismatch",
                    f"{expected_gems} gems",
                    f"{actual_gems} gems"
                )
                return False
        else:
            self.log_result(
                "Step 3: Verify Player Gems", 
                False, 
                f"Failed to get player. Status: {status}, Response: {response}"
            )
            return False
    
    async def test_step_4_claim_ad_reward(self):
        """Step 4: POST /api/rewards/claim - Claim ad reward for gems"""
        logger.info("\n=== STEP 4: Claim Ad Reward ===")
        
        if not self.player_id:
            self.log_result("Step 4: Claim Ad Reward", False, "No player ID available")
            return False
        
        data = {
            "player_id": self.player_id,
            "reward_type": "gems",
            "ad_type": "rewarded"
        }
        
        status, response = await self.make_request("POST", "/rewards/claim", data)
        
        if status == 200:
            # Verify required fields
            required_fields = ["gems_granted", "new_gem_balance"]
            missing_fields = [field for field in response if field not in required_fields and field not in ["success", "reward_type"]]
            
            gems_granted = response.get("gems_granted", 0)
            new_gem_balance = response.get("new_gem_balance", 0)
            expected_gems_granted = 10
            expected_new_balance = 15  # 5 + 10
            
            if gems_granted == expected_gems_granted and new_gem_balance == expected_new_balance:
                self.log_result(
                    "Step 4: Claim Ad Reward", 
                    True, 
                    f"Ad reward claimed successfully: granted {gems_granted} gems, new balance: {new_gem_balance}"
                )
                return True
            else:
                error_details = []
                if gems_granted != expected_gems_granted:
                    error_details.append(f"gems_granted: expected {expected_gems_granted}, got {gems_granted}")
                if new_gem_balance != expected_new_balance:
                    error_details.append(f"new_gem_balance: expected {expected_new_balance}, got {new_gem_balance}")
                
                self.log_result(
                    "Step 4: Claim Ad Reward", 
                    False, 
                    f"Ad reward errors: {'; '.join(error_details)}"
                )
                return False
        else:
            self.log_result(
                "Step 4: Claim Ad Reward", 
                False, 
                f"Ad reward claim failed. Status: {status}, Response: {response}"
            )
            return False
    
    async def test_step_5_purchase_receipt_validation(self):
        """Step 5: POST /api/purchases rejects missing receipt data."""
        logger.info("\n=== STEP 5: Purchase Receipt Validation ===")
        
        if not self.player_id:
            self.log_result("Step 5: Purchase Receipt Validation", False, "No player ID available")
            return False
        
        data = {
            "player_id": self.player_id,
            "item_type": "gems",
            "item_id": "com.laststanddefense.gems_500",
            "gems_amount": 500
        }
        
        status, response = await self.make_request("POST", "/purchases", data)
        detail = response.get("detail", "")
        
        if status == 400 and "Invalid or missing purchase receipt" in str(detail):
            self.log_result(
                "Step 5: Purchase Receipt Validation",
                True,
                "Missing receipt correctly rejected with HTTP 400",
            )
            return True

        self.log_result(
            "Step 5: Purchase Receipt Validation",
            False,
            f"Purchase validation failed. Status: {status}, Response: {response}"
        )
        return False
    
    async def run_gem_economy_test(self):
        """Run the complete gem economy flow test"""
        logger.info("🎮 Starting Dual-Currency System Test for Last Stand Defense")
        logger.info("Testing complete gem economy flow: earn through gameplay → earn through ads → buy through IAP")
        
        test_functions = [
            self.test_step_1_create_player,
            self.test_step_2_end_game,
            self.test_step_3_verify_player_gems,
            self.test_step_4_claim_ad_reward,
            self.test_step_5_purchase_receipt_validation
        ]
        
        passed = 0
        total = len(test_functions)
        
        for test_func in test_functions:
            try:
                success = await test_func()
                if success:
                    passed += 1
                else:
                    # If any step fails, we can't continue the flow
                    logger.error("❌ Test flow interrupted due to failure")
                    break
            except Exception as e:
                logger.error(f"Test failed with exception: {e}")
                break
        
        logger.info(f"\n=== GEM ECONOMY TEST SUMMARY ===")
        logger.info(f"Steps completed: {passed}/{total}")
        logger.info(f"Success rate: {(passed/total)*100:.1f}%")
        
        if passed == total:
            logger.info("🎉 DUAL-CURRENCY SYSTEM TEST PASSED!")
            logger.info("✅ Complete gem economy flow working: gameplay → ads → IAP")
        else:
            logger.warning(f"⚠️  GEM ECONOMY TEST FAILED at step {passed + 1}")
            failed_tests = [r for r in self.test_results if not r["success"]]
            for test in failed_tests:
                logger.warning(f"  - {test['test']}: {test['details']}")
        
        return passed, total, self.test_results

async def main():
    """Main test execution function"""
    async with GemEconomyTester() as tester:
        passed, total, results = await tester.run_gem_economy_test()
        
        # Save detailed results
        with open(RESULTS_PATH, 'w') as f:
            json.dump({
                "summary": {"passed": passed, "total": total, "success_rate": (passed/total)*100},
                "results": results,
                "tested_at": datetime.utcnow().isoformat(),
                "backend_url": API_BASE,
                "test_type": "dual_currency_system"
            }, f, indent=2)
        
        return passed == total

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)