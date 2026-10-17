import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isSupabaseConfigured, saveCaseRecord, fetchRecentCases } from '../src/services/supabase.js';

describe('Supabase Service: Configuration & Fail-Soft Behavior', () => {
  test('isSupabaseConfigured returns boolean without throwing', () => {
    const configured = isSupabaseConfigured();
    assert.equal(typeof configured, 'boolean');
  });

  test('saveCaseRecord handles unconfigured/offline state gracefully', async () => {
    const result = await saveCaseRecord({
      patientId: 'TEST_PATIENT',
      volumesMl: { whole_tumor: 12.5, tumor_core: 4.2, enhancing_tumor: 1.8 },
    });

    assert.equal(typeof result, 'object');
    assert.equal(typeof result.success, 'boolean');
    if (!result.success) {
      assert.equal(typeof result.error, 'string');
    }
  });

  test('fetchRecentCases handles unconfigured/offline state gracefully', async () => {
    const result = await fetchRecentCases(5);
    assert.equal(typeof result, 'object');
    assert.equal(typeof result.success, 'boolean');
    assert.ok(Array.isArray(result.records));
  });
});
