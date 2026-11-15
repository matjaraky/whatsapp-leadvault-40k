/**
 * Security Rules Red-Team & Dirty Dozen Verification Suite
 * Verifies that all 12 Dirty Dozen payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface SecurityPayloadTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: SecurityPayloadTestCase[] = [
  {
    id: 1,
    name: 'Unverified Email Spoof',
    collectionPath: '/users/uid_A',
    operation: 'create',
    auth: { uid: 'uid_A', email_verified: false },
    payload: {
      ownerId: 'uid_A',
      totalContacts: 0,
      activeStatusCount: 0,
      archiveLeadCount: 0,
      chunkCount: 0,
      defaultCountryCode: '+967',
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Cross-Tenant PII Read',
    collectionPath: '/users/uid_victim/contactChunks/chunk_0',
    operation: 'get',
    auth: { uid: 'uid_attacker', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Identity Spoofing on Create',
    collectionPath: '/users/uid_A/contactChunks/chunk_0',
    operation: 'create',
    auth: { uid: 'uid_A', email_verified: true },
    payload: {
      ownerId: 'uid_B',
      chunkIndex: 0,
      batchLabel: 'Spoofed Chunk',
      contactCount: 0,
      contacts: [],
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Orphaned Subcollection Write (No Parent UserVault)',
    collectionPath: '/users/uid_orphan/contactChunks/chunk_0',
    operation: 'create',
    auth: { uid: 'uid_orphan', email_verified: true },
    payload: {
      ownerId: 'uid_orphan',
      chunkIndex: 0,
      batchLabel: 'Orphan Chunk',
      contactCount: 0,
      contacts: [],
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Shadow Update / Ghost Field Injection',
    collectionPath: '/users/uid_A',
    operation: 'update',
    auth: { uid: 'uid_A', email_verified: true },
    payload: {
      totalContacts: 100,
      isPremium: true,
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'ID Poisoning Attack (Invalid Characters / Length)',
    collectionPath: '/users/uid_A/templates/invalid$id!@#',
    operation: 'create',
    auth: { uid: 'uid_A', email_verified: true },
    payload: {
      ownerId: 'uid_A',
      title: 'Test',
      category: 'offer',
      content: 'Hello',
      usageCount: 0,
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Unbounded Array Exhaustion (> 500 Contacts per Chunk)',
    collectionPath: '/users/uid_A/contactChunks/chunk_0',
    operation: 'create',
    auth: { uid: 'uid_A', email_verified: true },
    payload: {
      ownerId: 'uid_A',
      chunkIndex: 0,
      batchLabel: 'Oversized Chunk',
      contactCount: 501,
      contacts: new Array(501).fill({
        id: 'c1',
        name: 'Lead',
        phone: '+967770000000',
        tier: 'archive_lead',
        group: 'Batch 1'
      }),
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Array Element Type Poisoning',
    collectionPath: '/users/uid_A/contactChunks/chunk_0',
    operation: 'create',
    auth: { uid: 'uid_A', email_verified: true },
    payload: {
      ownerId: 'uid_A',
      chunkIndex: 0,
      batchLabel: 'Poisoned Array Element',
      contactCount: 1,
      contacts: [12345],
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Timestamp Forgery on Create',
    collectionPath: '/users/uid_A/templates/tpl_1',
    operation: 'create',
    auth: { uid: 'uid_A', email_verified: true },
    payload: {
      ownerId: 'uid_A',
      title: 'Forged Timestamp',
      category: 'offer',
      content: 'Discount offer',
      usageCount: 0,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Immutable Field Mutation (ownerId / createdAt)',
    collectionPath: '/users/uid_A/contactChunks/chunk_0',
    operation: 'update',
    auth: { uid: 'uid_A', email_verified: true },
    payload: {
      ownerId: 'uid_B',
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Value Poisoning on Update (Oversized String > 2000 chars)',
    collectionPath: '/users/uid_A/templates/tpl_1',
    operation: 'update',
    auth: { uid: 'uid_A', email_verified: true },
    payload: {
      content: 'A'.repeat(2500),
      updatedAt: 'SERVER_TIMESTAMP'
    },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Unauthorized Cross-User List Scraping',
    collectionPath: '/users/uid_victim/contactChunks',
    operation: 'list',
    auth: { uid: 'uid_attacker', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED'
  }
];
