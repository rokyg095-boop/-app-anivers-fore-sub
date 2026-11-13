# Security Specification — AniVerse Firestore

## 1. Data Invariants
- Every document in `episodeSources/{episodeId}` MUST match `^[a-zA-Z0-9_-]+$` (`<= 128` chars), enforce strict allowlisted keys, contain `isPublic == true`, include server-validated `createdAt == request.time` on create (immutable thereafter) and `updatedAt == request.time`, and match `updatedByUid == request.auth.uid`.
- Public visitors may read (`get` / `list`) ONLY documents where `isPublic == true`. Visitors may NEVER write, modify, or delete any document.
- Only verified admins (`request.auth.token.email_verified == true` AND either bootstrapped admin email `rokyg095@gmail.com` or trusted `admins/{uid}` document) can write to `episodeSources` or manage `admins`.
- Arrays (`backupDriveLinks`, `subtitles`) are strictly bounded to `.size() <= 10` and element-checked when non-empty.
- Zero PII (`email`, `phone`, `address`) is stored in public collections (`episodeSources`).

## 2. Dirty Dozen Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Create on `episodeSources/at-s1-ep1`**: Rejects unauthenticated write.
2. **Non-Admin Verified User Create on `episodeSources/at-s1-ep1`**: Rejects regular viewer trying to overwrite episode links.
3. **Unverified Admin Email Spoof (`email: rokyg095@gmail.com, email_verified: false`)**: Rejects unverified token even if email matches.
4. **Shadow/Ghost Field Injection (`isAdminOverride: true`)**: Rejected by `data.keys().hasOnly(...)`.
5. **Identity Spoofing (`updatedByUid: "another-uid"`)**: Rejected by `data.updatedByUid == request.auth.uid`.
6. **ID Poisoning (`episodeSources/a...2000chars`)**: Rejected by `isValidId(episodeId)`.
7. **Oversized String Exhaustion (`driveLink` > 1000 chars)**: Rejected by `data.driveLink.size() <= 1000`.
8. **Unbounded Array Attack (`backupDriveLinks` with 11 items)**: Rejected by `data.backupDriveLinks.size() <= 10`.
9. **Array Element Type Poisoning (`backupDriveLinks: ["not-a-map"]`)**: Rejected by `data.backupDriveLinks[0] is map`.
10. **Client-Forged Timestamp (`createdAt: oldDate` on create, or mutating `createdAt` on update)**: Rejected by `request.time` and immutability checks.
11. **Self-Assigned Admin Role (`admins/{myUid}` created by non-admin)**: Rejected because only existing verified admin can write `admins/{userId}`.
12. **Blanket List Without `isPublic == true` Filter on `episodeSources`**: Rejected if query doesn't constrain `isPublic == true` (when private docs exist) or attempts to list `admins` as non-admin.
