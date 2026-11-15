# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Root Ownership & Verification**: Every operation on `/users/{userId}` and its subcollections (`contactChunks`, `templates`) requires an authenticated user with `request.auth.token.email_verified == true` and `request.auth.uid == userId`.
2. **Master Gate Relational Sync**: A `ContactChunk` or `MessageTemplate` under `/users/{userId}/...` cannot be accessed, created, updated, or deleted unless the parent `/users/{userId}` document exists and its `ownerId` matches `request.auth.uid`.
3. **Strict Key & Schema Blueprint**: All writes (`create` and `update`) must pass `isValidUserVault`, `isValidContactChunk`, or `isValidMessageTemplate` with strict `hasAll` and `hasOnly` key allowlists, explicit type checks, and string/list `.size()` boundaries.
4. **Total Array Guarding**: `ContactChunk.contacts` is strictly bounded to `<= 500` items, and when non-empty, the first element (`contacts[0]`) is verified as a well-formed contact map with bounded `id`, `name`, `phone`, `tier`, and `group` strings.
5. **Temporal & Identity Immutability**: `ownerId` and `createdAt` are immutable across updates (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`), and `createdAt`/`updatedAt` must equal `request.time`.
6. **Zero Client Query Delegation**: Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid && request.auth.uid == userId` without calling `get()` or `exists()`.

## 2. The "Dirty Dozen" Payloads

1. **Unverified Email Spoof**: Authenticated user with `email_verified: false` attempting to create `/users/{userId}`.
2. **Cross-Tenant PII Read**: User `uid_attacker` attempting `get` on `/users/uid_victim/contactChunks/chunk_0`.
3. **Identity Spoofing on Create**: User `uid_A` creating `/users/uid_A/contactChunks/chunk_0` with `ownerId: "uid_B"`.
4. **Orphaned Subcollection Write**: User `uid_A` creating `/users/uid_A/contactChunks/chunk_0` when `/users/uid_A` does not exist.
5. **Shadow Update / Ghost Field**: Updating `/users/uid_A` with an undeclared field `isPremium: true`.
6. **ID Poisoning Attack**: Creating `/users/uid_A/templates/{1500_char_junk_id}` exceeding 128 chars or containing invalid characters.
7. **Unbounded Array Exhaustion**: Creating a `ContactChunk` where `contacts.size() == 501`.
8. **Array Element Type Poisoning**: Creating a `ContactChunk` where `contacts[0]` is a raw number `12345` instead of a valid contact map.
9. **Timestamp Forgery on Create**: Creating a `MessageTemplate` with a past or future `createdAt` instead of `request.time`.
10. **Immutable Field Mutation**: Updating `createdAt` or `ownerId` on an existing `ContactChunk`.
11. **Value Poisoning on Update**: Updating `MessageTemplate.content` with a 10,000-character string (exceeding `maxLength: 2000`).
12. **Unauthorized List Scraping**: Listing `/users/uid_victim/contactChunks` without matching `request.auth.uid == userId && resource.data.ownerId == request.auth.uid`.
