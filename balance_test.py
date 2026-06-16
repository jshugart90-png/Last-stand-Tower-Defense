#!/usr/bin/env python3
"""
Focused test for game end endpoint new_balance field verification
Tests the specific scenario requested in the review.
"""

import json
import os
import sys

import requests

# Backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BACKEND_URL:
    print("EXPO_PUBLIC_BACKEND_URL is required to run balance_test.py")
    sys.exit(1)
API_BASE = f"{BACKEND_URL}/api"

def test_game_end_new_balance():
    """Test that game end endpoint returns correct gem balance fields."""
    print("Testing Game End gem balance fields")
    print("=" * 50)
    
    try:
        # Step 1: Create a player with nickname "BalanceTest" and device_id "balance-test-123"
        print("Step 1: Creating player...")
        player_data = {
            "nickname": "BalanceTest",
            "device_id": "balance-test-123"
        }
        
        response = requests.post(f"{API_BASE}/players", json=player_data)
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
        
        response = requests.post(f"{API_BASE}/games/end", json=game_data)
        print(f"POST /api/games/end - Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Failed to end game: {response.text}")
            return False
            
        game_result = response.json()
        print(f"✅ Game end response: {json.dumps(game_result, indent=2)}")
        
        # Step 3: Verify gem balance fields
        print("\nStep 3: Verifying gem balance fields...")

        if "new_gem_balance" not in game_result:
            print("CRITICAL FAILURE: new_gem_balance field is missing from response!")
            return False

        new_gem_balance = game_result["new_gem_balance"]
        gems_earned = game_result.get("gems_earned", 0)
        expected_balance = gems_earned

        print(f"Expected new_gem_balance: {expected_balance}")
        print(f"Actual new_gem_balance: {new_gem_balance}")

        if new_gem_balance != expected_balance:
            print(f"CRITICAL FAILURE: new_gem_balance mismatch! Expected {expected_balance}, got {new_gem_balance}")
            return False

        print(f"CRITICAL CHECK PASSED: new_gem_balance = {new_gem_balance}")

        # Step 4: Verify player's gem balance is updated correctly
        print("\nStep 4: Verifying player gem balance...")
        response = requests.get(f"{API_BASE}/players/{player_id}")
        print(f"GET /api/players/{player_id} - Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ Failed to get player: {response.text}")
            return False
            
        player_data = response.json()
        player_gems = player_data["gems"]

        print(f"Player gem balance: {player_gems}")

        if player_gems != expected_balance:
            print(f"Player gem balance mismatch! Expected {expected_balance}, got {player_gems}")
            return False

        print(f"Player gem balance verified: {player_gems} gems")

        print("\nALL TESTS PASSED!")
        print("new_gem_balance field is present and correct")
        print("Player gem balance is updated correctly")
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