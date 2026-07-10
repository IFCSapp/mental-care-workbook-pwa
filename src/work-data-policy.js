export const DATA_SCHEMA_VERSION = 2;

export const WORK_DATA_POLICY = Object.freeze({
  1: Object.freeze({ mode: 'persisted', storageKey: 'worksheet_auto_save_v1', schemaVersion: DATA_SCHEMA_VERSION, backup: true, dataLabel: '記録型', duration: '15〜30分' }),
  2: Object.freeze({ mode: 'persisted', storageKey: 'dots_work_state_v3', legacyStorageKeys: ['dots_work_state_v2'], schemaVersion: DATA_SCHEMA_VERSION, backup: true, dataLabel: '記録型', duration: '10〜20分' }),
  3: Object.freeze({ mode: 'ephemeral', storageKey: null, backup: false, dataLabel: '体験型', duration: '1〜4分' }),
  4: Object.freeze({ mode: 'ephemeral', storageKey: null, backup: false, dataLabel: '体験型', duration: '5〜10分' }),
  5: Object.freeze({ mode: 'persisted', storageKey: 'act_worksheet_standalone_data', schemaVersion: DATA_SCHEMA_VERSION, backup: true, dataLabel: '記録型', duration: '15〜30分' }),
  6: Object.freeze({ mode: 'ephemeral', storageKey: null, backup: false, dataLabel: '体験型', duration: '3〜10分' }),
  7: Object.freeze({ mode: 'ephemeral', storageKey: null, backup: false, dataLabel: '体験型', duration: '3〜7分' }),
  8: Object.freeze({ mode: 'persisted', storageKey: 'control_map_state_v1', schemaVersion: DATA_SCHEMA_VERSION, backup: true, dataLabel: '記録型', duration: '10〜20分' }),
});

export const PERSISTED_WORK_IDS = Object.freeze(
  Object.entries(WORK_DATA_POLICY)
    .filter(([, policy]) => policy.mode === 'persisted')
    .map(([workId]) => Number(workId)),
);

export const EPHEMERAL_WORK_IDS = Object.freeze(
  Object.entries(WORK_DATA_POLICY)
    .filter(([, policy]) => policy.mode === 'ephemeral')
    .map(([workId]) => Number(workId)),
);

export function getWorkDataPolicy(workId) {
  return WORK_DATA_POLICY[Number(workId)] || null;
}

export function migrateWorkData(workId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`INVALID_WORK_DATA:${workId}`);
  }
  if (input.schemaVersion === DATA_SCHEMA_VERSION) return structuredClone(input);
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
    throw new Error(`UNSUPPORTED_WORK_SCHEMA:${workId}`);
  }

  const migrated = structuredClone(input);
  migrated.schemaVersion = DATA_SCHEMA_VERSION;
  if (Number(workId) === 1) {
    migrated.basicScene ??= '';
    migrated.basicNotice ??= '';
    migrated.basicAction ??= '';
    migrated.basicImmediate ??= '';
    migrated.basicLater ??= '';
  }
  if (Number(workId) === 2) migrated.behaviorContexts ??= {};
  if (Number(workId) === 5) {
    migrated.supportFocusDomains ??= [];
    Object.values(migrated.domainData || {}).forEach((domain) => {
      domain.supportFocus ??= false;
      domain.difficultConditions ??= '';
      domain.helpfulConditions ??= '';
      domain.resourcesNeeded ??= '';
      domain.actionChoice ??= '';
      domain.actionConditions ??= '';
    });
  }
  if (Number(workId) === 8) {
    migrated.continuation ??= { status: '', support: '', alternative: '' };
    migrated.nextStep ??= {};
    migrated.nextStep.help ??= '';
    migrated.nextStep.alternative ??= '';
  }
  return migrated;
}

export function migrateStoredEntries(entries) {
  return entries.map(([key, value]) => {
    const policyEntry = Object.entries(WORK_DATA_POLICY).find(([, policy]) => (
      policy.storageKey === key || policy.legacyStorageKeys?.includes(key)
    ));
    if (!policyEntry) return [key, value];
    const [workId] = policyEntry;
    return [key, JSON.stringify(migrateWorkData(Number(workId), JSON.parse(value)))];
  });
}

export function migrateWorkbookStorage(storage) {
  const candidates = PERSISTED_WORK_IDS.flatMap((workId) => {
    const policy = WORK_DATA_POLICY[workId];
    return [policy.storageKey, ...(policy.legacyStorageKeys || [])]
      .map((key) => [key, storage.getItem(key)])
      .filter(([, value]) => value !== null);
  });
  if (!candidates.length) return { migratedKeys: [] };

  const originals = new Map(candidates);
  const migrated = migrateStoredEntries(candidates);
  try {
    migrated.forEach(([key, value]) => storage.setItem(key, value));
  } catch (error) {
    originals.forEach((value, key) => {
      try { storage.setItem(key, value); } catch {}
    });
    throw error;
  }
  return { migratedKeys: migrated.map(([key]) => key) };
}
