# Security Specification: 전주신동초 마니또 (Jeonju Shindong Elementary Manitto)

## 1. Data Invariants

1. **Authentication & Email Verification**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
2. **Workspace Ownership Isolation**: Every top-level document and subcollection document is bound to `workspaceOwnerUid == request.auth.uid` (or `isAdmin()`), preventing cross-tenant scraping or unauthorized list queries.
3. **Strict Key & Size Enforcement**: Every entity enforces `.keys().hasAll(...)` and `.keys().hasOnly(...)` on create, `.affectedKeys().hasOnly(...)` on update, and `.size() <= MAX` on all strings and lists.
4. **Temporal & Identity Immutability**: `createdAt` and `workspaceOwnerUid` are immutable after creation; `createdAt` and `updatedAt` must match `request.time`.
5. **Audit Log & Score Ledger Immutability**: `auditLogs` cannot be updated or deleted by non-admins; `scoreLedger` entries preserve full transaction history.
6. **Master Gate Relational Sync**: `/loungeSessions/{sessionId}/participants/{participantId}` validates parent `/loungeSessions/{sessionId}` ownership via `get()`.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write**: `auth = null`, creating `/users/user_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email: 'vortexai369@gmail.com', email_verified: false } }` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Create**: Creating `/missions/m1` with extra field `isSuperSecret: true` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Update**: Updating `/users/u1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: Creating `/missionSubmissions/sub1` with `workspaceOwnerUid: 'other_user'` -> `PERMISSION_DENIED`.
6. **Owner Mutation on Update**: Updating `/letters/l1` changing `workspaceOwnerUid` -> `PERMISSION_DENIED`.
7. **Timestamp Forgery on Create**: Creating `/scoreLedger/led1` with past client timestamp `createdAt != request.time` -> `PERMISSION_DENIED`.
8. **CreatedAt Mutation on Update**: Updating `/missions/m1` with modified `createdAt` -> `PERMISSION_DENIED`.
9. **Resource Poisoning (Oversized ID)**: Creating `/users/<200-char-id>` -> `PERMISSION_DENIED`.
10. **Value Poisoning (Oversized String)**: Updating `/loungeMessages/msg1` with `body` of 5,000 chars (`> 400`) -> `PERMISSION_DENIED`.
11. **Unbounded Array Injection**: Updating `/users/u1` with `interests` list of 25 items (`> 10`) -> `PERMISSION_DENIED`.
12. **Audit Log Tampering**: Attempting `delete` or `update` on `/auditLogs/log1` -> `PERMISSION_DENIED`.
