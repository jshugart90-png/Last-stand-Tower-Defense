import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mixEqualPower, musicGain, sfxGain } from './audioMix';
import {
  computeHitDamage,
  nearestOtherIds,
  needsPathChoice,
  resolveTowerStats,
} from './combat';
import { getDifficultyModifiers } from './difficulty';
import { loginRetryDelayMs, loginStatusMessage, LOGIN_TIMEOUT_MS } from './login';
import {
  mergeAchievementLists,
  mergeNumericRecord,
  migrateAudioPrefs,
  migrateFieldBriefing,
  unionTowerUnlocks,
} from './save';
import { getWaveConfig, getWavePlannedEnemyCount } from '../constants/game';
import { GAME_MAPS } from '../constants/maps';
import { getArenaMap } from '../constants/arenaMaps';
import { createDefaultAchievements } from '../constants/progression';

describe('audio mix', () => {
  it('crossfades from outgoing to incoming', () => {
    const start = mixEqualPower(0);
    const mid = mixEqualPower(0.5);
    const end = mixEqualPower(1);
    assert.ok(start.outgoing > 0.99);
    assert.ok(start.incoming < 0.01);
    assert.ok(Math.abs(mid.outgoing - mid.incoming) < 0.02);
    assert.ok(end.incoming > 0.99);
  });

  it('mutes when disabled and clamps volume', () => {
    assert.equal(musicGain(false, 1), 0);
    assert.equal(sfxGain(true, 2), 1);
    assert.equal(sfxGain(true, -1), 0);
  });
});

describe('login', () => {
  it('waits long enough for a Render cold start and stays calm', () => {
    assert.ok(LOGIN_TIMEOUT_MS >= 60_000);
    assert.equal(loginRetryDelayMs(0), 0);
    assert.ok(loginRetryDelayMs(1) >= 1000);
    const copy = loginStatusMessage(2);
    assert.equal(copy.toLowerCase().includes('error'), false);
    assert.match(copy, /try 2 of/i);
  });
});

describe('saves', () => {
  it('turns the factory mute on once, then respects a later mute', () => {
    const first = migrateAudioPrefs({ soundEnabled: false });
    assert.equal(first.soundEnabled, true);
    assert.equal(first.audioPrefsRevision, 1);
    const later = migrateAudioPrefs({ soundEnabled: false, audioPrefsRevision: 1 });
    assert.equal(later.soundEnabled, false);
  });

  it('keeps old tower levels and defaults new towers', () => {
    const levels = mergeNumericRecord({ machine_gun: 4, sniper: 2 });
    assert.equal(levels.machine_gun, 4);
    assert.equal(levels.sniper, 2);
    assert.equal(levels.tesla, 0);
    assert.equal(levels.cannon, 0);
  });

  it('unions server and local tower unlocks', () => {
    const merged = unionTowerUnlocks(['machine_gun', 'tesla'], ['machine_gun', 'sniper']);
    assert.deepEqual(merged.sort(), ['machine_gun', 'sniper', 'tesla'].sort());
  });

  it('adds new achievements without clearing old unlocks', () => {
    const defaults = createDefaultAchievements();
    const stored = defaults.map((a) =>
      a.id === 'first_blood' ? { ...a, unlocked: true } : { ...a, unlocked: false }
    );
    const merged = mergeAchievementLists(defaults, stored);
    assert.equal(merged.find((a) => a.id === 'first_blood')?.unlocked, true);
    assert.ok(merged.some((a) => a.id === 'wing_clipper'));
  });

  it('skips the field briefing for players who already finished the old tutorial', () => {
    assert.equal(migrateFieldBriefing({ tutorialCompleted: true }), true);
    assert.equal(migrateFieldBriefing({ tutorialCompleted: false }), false);
    assert.equal(migrateFieldBriefing({ tutorialCompleted: true, fieldBriefingSeen: false }), false);
  });
});

describe('combat', () => {
  it('lets armor shrug off machine guns and not cannons', () => {
    const mg = resolveTowerStats('machine_gun', { damage: 10, fireRate: 300, range: 3, projectileSpeed: 8 }, 0, 0, 'none', 0);
    const cannon = resolveTowerStats('cannon', { damage: 70, fireRate: 2200, range: 4.5, projectileSpeed: 7 }, 0, 0, 'none', 0);
    const mgHit = computeHitDamage({
      raw: mg.damage,
      flying: false,
      airMultiplier: mg.airMultiplier,
      groundMultiplier: mg.groundMultiplier,
      armor: 9,
      pierce: mg.pierce,
      damageReduction: 0,
      doubleDamage: false,
    });
    const cannonHit = computeHitDamage({
      raw: cannon.damage,
      flying: false,
      airMultiplier: cannon.airMultiplier,
      groundMultiplier: cannon.groundMultiplier,
      armor: 9,
      pierce: cannon.pierce,
      damageReduction: 0,
      doubleDamage: false,
    });
    assert.ok(mgHit < 3);
    assert.ok(cannonHit > 40);
  });

  it('keeps ground tesla off flying targets and lets flak hit them', () => {
    const tesla = resolveTowerStats('tesla', { damage: 18, fireRate: 900, range: 3.2, projectileSpeed: 14 }, 0, 0, 'none', 0);
    const flak = resolveTowerStats('flak', { damage: 28, fireRate: 1200, range: 4, splashRadius: 1.1, projectileSpeed: 9 }, 0, 0, 'none', 0);
    assert.equal(tesla.airMultiplier, 0);
    assert.ok(flak.airMultiplier > 1);
    const flakHit = computeHitDamage({
      raw: flak.damage,
      flying: true,
      airMultiplier: flak.airMultiplier,
      groundMultiplier: flak.groundMultiplier,
      armor: 0,
      pierce: flak.pierce,
      damageReduction: 0,
      doubleDamage: false,
    });
    assert.ok(flakHit > flak.damage);
  });

  it('asks for a path only at the branch upgrade', () => {
    assert.equal(needsPathChoice(2, 'none'), true);
    assert.equal(needsPathChoice(2, 'alpha'), false);
    assert.equal(needsPathChoice(5, 'none'), false);
  });

  it('chains to the nearest other enemies', () => {
    const ids = nearestOtherIds(
      { x: 0, y: 0 },
      'self',
      [
        { id: 'self', x: 0, y: 0 },
        { id: 'far', x: 5, y: 0 },
        { id: 'near', x: 1, y: 0 },
        { id: 'mid', x: 2, y: 0 },
      ],
      2,
      3
    );
    assert.deepEqual(ids, ['near', 'mid']);
  });

  it('applies deadeye as a damage increase', () => {
    const base = { damage: 50, fireRate: 2000, range: 6, projectileSpeed: 12 };
    const plain = resolveTowerStats('sniper', base, 3, 0, 'none', 0);
    const deadeye = resolveTowerStats('sniper', base, 3, 0, 'beta', 0);
    assert.ok(deadeye.damage > plain.damage);
  });
});

describe('waves', () => {
  it('introduces fast, flying, armored, and boss units on schedule', () => {
    const early = getWaveConfig(1);
    assert.deepEqual(early.enemies.map((e) => e.type), ['basic']);
    const mid = getWaveConfig(4);
    assert.ok(mid.enemies.some((e) => e.type === 'fast'));
    const air = getWaveConfig(8);
    assert.ok(air.enemies.some((e) => e.type === 'flying'));
    const plate = getWaveConfig(11);
    assert.ok(plate.enemies.some((e) => e.type === 'armored'));
    const boss = getWaveConfig(10);
    assert.ok(boss.enemies.some((e) => e.type === 'boss'));
    assert.equal(getWavePlannedEnemyCount(10), boss.enemies.reduce((s, e) => s + e.count, 0));
  });

  it('ships the new arenas with unlock costs', () => {
    assert.ok(GAME_MAPS.some((m) => m.id === 'cinder_ridge'));
    assert.ok(GAME_MAPS.some((m) => m.id === 'gale_bastion'));
    for (const map of GAME_MAPS) {
      if (map.id === 'classic') continue;
      assert.ok(getArenaMap(map.id), map.id);
      assert.equal(typeof map.unlock?.gemCost, 'number');
    }
  });

  it('scales difficulty without changing the unit mix', () => {
    const veteran = getDifficultyModifiers('veteran');
    assert.ok(veteran.enemyHealth > 1);
    assert.ok(veteran.reward > 1);
    assert.equal(getDifficultyModifiers('nope').id, 'normal');
  });
});
