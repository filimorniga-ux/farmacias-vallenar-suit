# V1 to V2 Actions Migration Guide

## Purpose
This guide documents the migration path from insecure V1 action modules to secure V2 modules for the Farmacias Vallenar application.

## Current State
- **V1 files**: 23 files (legacy, insecure)
- **V2 files**: 23 files (secure, hardened)
- **Status**: Coexisting (both are present)

## Why V2?
V2 modules implement security hardening required for production:
- ✅ SERIALIZABLE transaction isolation
- ✅ bcrypt PIN hashing
- ✅ Rate limiting
- ✅ Audit logging
- ✅ RBAC enforcement
- ✅ Input validation with Zod

## Migration Strategy

### Step 1: Identify Usage
For each V1 module, find all imports:
```bash
grep -r "from '@/actions/MODULE'" src/ --include="*.tsx" --include="*.ts"
```

### Step 2: Check V2 Equivalents
| V1 Function | V2 Equivalent |
|-------------|---------------|
| `getLocations()` | `getLocationsSecure()` |
| `createUser()` | `createUserSecure()` |
| `getAuditLogs()` | `getAuditLogsPaginated()` |

### Step 3: Update Import
```typescript
// Before
import { getLocations } from '@/actions/locations';

// After  
import { getLocationsSecure as getLocations } from '@/actions/locations-v2';
```

### Step 4: Verify Build
```bash
npm run build
```

## V1 → V2 Mapping

| V1 File | V2 File | Risk Level |
|---------|---------|------------|
| attendance.ts | attendance-v2.ts | HIGH |
| audit.ts | audit-v2.ts | MEDIUM |
| auth.ts | auth-v2.ts | CRITICAL |
| cash-management.ts | cash-management-v2.ts | HIGH |
| customers.ts | customers-v2.ts | LOW |
| finance-closing.ts | finance-closing-v2.ts | HIGH |
| inventory.ts | inventory-v2.ts | HIGH |
| locations.ts | locations-v2.ts | MEDIUM |
| notifications.ts | notifications-v2.ts | LOW |
| operations.ts | operations-v2.ts | HIGH |
| procurement.ts | procurement-v2.ts | HIGH |
| products.ts | products-v2.ts | MEDIUM |
| quotes.ts | quotes-v2.ts | MEDIUM |
| reconciliation.ts | reconciliation-v2.ts | HIGH |
| sales.ts | sales-v2.ts | HIGH |
| security.ts | security-v2.ts | CRITICAL |
| shift-handover.ts | shift-handover-v2.ts | HIGH |
| suppliers.ts | suppliers-v2.ts | MEDIUM |
| sync.ts | sync-v2.ts | MEDIUM |
| terminals.ts | terminals-v2.ts | HIGH |
| treasury.ts | treasury-v2.ts | HIGH |
| users.ts | users-v2.ts | CRITICAL |
| wms.ts | wms-v2.ts | HIGH |

## Delete Strategy

Once all consumers are migrated:
1. Run full test suite: `npm run test`
2. Build verification: `npm run build`
3. Delete V1 file: `rm src/actions/MODULE.ts`
4. Commit: `git commit -m "chore: remove deprecated MODULE.ts"`

## Timeline
**Target**: Q1 2025 (after client handover)

---
*Created: 2025-12-25*
