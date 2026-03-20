#!/usr/bin/env python3
"""
Focused test for game end endpoint new_balance field verification
Tests the specific scenario requested in the review.
"""

import requests
import json
import sys

# Backend URL from frontend/.env
BACKEND_URL = "https://wave-survival-game-2.preview.emergentagent.com/api"

def test_game_end_new_balance():
    """Test that game end endpoint returns correct new_balance field"""
    print("🎯 Testing Game End new_balance Field")
    print("=" * 50)
    
    try:
        # Step 1: Create a player with nickname "BalanceTest" and device_id "balance-test-123"
        print("Step 1: Creating player...")
        player_data = {
            "nickname": "BalanceTest",
            "device_id": "balance-test-123"
        }
        
        response = requests.post(f"{BACKEND_URL}/players", json=player_data)
        print(f"POST /api/players - Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Failed to create player: {response.text}")
            return False
            
        player_result = response.json()
        print(f"Player creation response: {json.dumps(player_result, indent=2)}")
        
        # Handle different possible response formats
        if "id" in player_result:
            player_id = player_result["id"]
        elif "_id" in player_result:
            player_id = player_result["_id"]
        else:
            print(f"❌ No ID found in response: {player_result}")
            return False
            
        print(f"✅ Player created with ID: {player_id}")
        
        # Step 2: Submit game end with specific values
        print("\nStep 2: Submitting game end...")
        game_data = {
            "player_id": player_id,
            "wave_reached": 5,
            "coins_earned": 150,
            "enemies_killed": 20,
            "towers_placed": 3,
            "duration_seconds": 60
        }
        
        response = requests.post(f"{BACKEND_URL}/games/end", json=game_data)
        print(f"POST /api/games/end - Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Failed to end game: {response.text}")
            return False
            
        game_result = response.json()
        print(f"✅ Game end response: {json.dumps(game_result, indent=2)}")
        
        # Step 3: CRITICAL CHECK - Verify new_balance field
        print("\nStep 3: CRITICAL CHECK - Verifying new_balance field...")
        
        if "new_balance" not in game_result:
            print("❌ CRITICAL FAILURE: new_balance field is missing from response!")
            return False
            
        new_balance = game_result["new_balance"]
        expected_balance = 100 + 150  # starting_coins(100) + coins_earned(150) = 250
        
        print(f"Expected new_balance: {expected_balance}")
        print(f"Actual new_balance: {new_balance}")
        
        if new_balance != expected_balance:
            print(f"❌ CRITICAL FAILURE: new_balance mismatch! Expected {expected_balance}, got {new_balance}")
            return False
            
        print(f"✅ CRITICAL CHECK PASSED: new_balance = {new_balance} (correct!)")
        
        # Step 4: Verify player's coins balance is updated correctly
        print("\nStep 4: Verifying player balance...")
        response = requests.get(f"{BACKEND_URL}/players/{player_id}")
        print(f"GET /api/players/{player_id} - Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Failed to get player: {response.text}")
            return False
            
        player_data = response.json()
        player_coins = player_data["coins"]
        
        print(f"Player coins balance: {player_coins}")
        
        if player_coins != expected_balance:
            print(f"❌ Player balance mismatch! Expected {expected_balance}, got {player_coins}")
            return False
            
        print(f"✅ Player balance verified: {player_coins} coins")
        
        print("\n🎉 ALL TESTS PASSED!")
        print("✅ new_balance field is present and correct")
        print("✅ Player balance is updated correctly")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = test_game_end_new_balance()
    sys.exit(0 if success else 1)