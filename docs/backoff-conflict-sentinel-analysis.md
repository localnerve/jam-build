---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: April 3, 2026
Title: Exponential Backoff Implementation Analysis
---

# Concurrent Mutations During Exponential Backoff: Baseline Integrity Analysis

- [Concurrent Mutations During Exponential Backoff: Baseline Integrity Analysis](#concurrent-mutations-during-exponential-backoff-baseline-integrity-analysis)
  - [The Core Risk](#the-core-risk)
  - [Detailed Trace of `_mayUpdate` During Backoff (Collection Path)](#detailed-trace-of-_mayupdate-during-backoff-collection-path)
  - [The More Immediate Problem: The `newData` Write + Next `may-update`](#the-more-immediate-problem-the-newdata-write--next-may-update)
  - [The Real Threat: Interleaved `processVersionConflicts` Invocations](#the-real-threat-interleaved-processversionconflicts-invocations)
  - [Summary of Risks, Ranked](#summary-of-risks-ranked)
  - [How `AffiliatedLock` and `CONFLICT_SENTINEL` Divide Responsibility](#how-affiliatedlock-and-conflict_sentinel-divide-responsibility)
  - [The CONFLICT\_SENTINEL Approach](#the-conflict_sentinel-approach)
    - [Purpose 1: Serialize `processVersionConflicts` (primary)](#purpose-1-serialize-processversionconflicts-primary)
    - [Purpose 2: Guard `baseStore` from stale re-snapshot](#purpose-2-guard-basestore-from-stale-re-snapshot)
    - [Shared semantics](#shared-semantics)
    - [Lifecycle](#lifecycle)
    - [For the max-retries-exceeded case](#for-the-max-retries-exceeded-case)
  - [Implementation — Final State](#implementation--final-state)
    - [`sw.data.helpers.js` — sentinel exports](#swdatahelpersjs--sentinel-exports)
    - [`sw.data.helpers.js` — `_mayUpdate` sentinel guard (both paths symmetric)](#swdatahelpersjs--_mayupdate-sentinel-guard-both-paths-symmetric)
    - [`sw.utils.js` — `AffiliatedLock` and `sendBeacon`](#swutilsjs--affiliatedlock-and-sendbeacon)
  - [Serializing `processBatchUpdates` with `AffiliatedLock`](#serializing-processbatchupdates-with-affiliatedlock)
    - [Why plain `CriticalSection` fails: deadlock](#why-plain-criticalsection-fails-deadlock)
    - [The `AffiliatedLock` primitive](#the-affiliatedlock-primitive)
    - [`processBatchUpdates` wrapper](#processbatchupdates-wrapper)
    - [`affiliationId` threading through the call chain](#affiliationid-threading-through-the-call-chain)
  - [`failProcessVersionConflicts` — Max Retries Exceeded](#failprocessversionconflicts--max-retries-exceeded)
  - [Cooperative Timer: `ignoreInactivity` Extension](#cooperative-timer-ignoreinactivity-extension)
    - [The Two-Timer Semantic Split](#the-two-timer-semantic-split)
    - [What `ignoreInactivity` Governs](#what-ignoreinactivity-governs)
    - [What `ignoreInactivity` Does NOT Change](#what-ignoreinactivity-does-not-change)

## The Core Risk

The exponential backoff timer introduces an extended async window between two sequential `processBatchUpdates` calls. During that window — which can be seconds long (up to `conflictBackoffMax + jitter` each step, up to `conflictMaxRetries` times) — the user is still active. Any user mutation that comes in during backoff delay will:

1. Trigger `queueMutation` in `stores.js` → `swActive.postMessage({ action: 'may-update', ... })`
2. Trigger `mayUpdate` → `_mayUpdate` in `sw.data.helpers.js`

The question is: what does `_mayUpdate` do to the `baseStore` during this window, and does it corrupt the 3-way merge basis that the in-flight backoff conflict resolution is counting on?

---

## Detailed Trace of `_mayUpdate` During Backoff (Collection Path)

```
_mayUpdate({ storeType, document, collection, op })
  baseCopy = db.getFromIndex(baseStoreName, 'collection', [storeType, document, collection])
```

**Case A — No stale base, baseCopy exists, same op:**
```
  staleBase = false, willDelete = false
  baseCopy exists → else if (baseCopy) branch
  baseCopy.op === op (same mutation type) → NO increment, NO write
```
→ **SAFE.** Base is untouched. Reference count unchanged.

**Case B — No stale base, baseCopy exists, different op:**
```
  staleBase = false, willDelete = false
  baseCopy exists → else if (baseCopy) branch
  baseCopy.op !== op → reference += 1, db.put(baseCopy)
```
→ **SAFE (for correctness).** The reference count goes up, but the *properties snapshot* is the original pre-conflict one. The base content is protected. The reference inflation means `clearBaseStoreRecords` needs N+1 decrements to fully remove it — this is the designed behavior for concurrent op types.

**Case C — Base is STALE (`Date.now() - baseCopy.timestamp >= STALE_BASE_LIFESPAN`):**
```
  staleBase = true, willDelete = true
  if (willDelete && baseCopy) → db.delete(baseStoreName, baseCopy.id)  ← DELETES THE BASE
  if (!clearOnly) → original = db.get(storeName, [scope, document, collection])
    → db.add(baseStoreName, { ...original.properties, timestamp: Date.now() })  ← NEW SNAPSHOT
```
→ **🚨 DANGEROUS.** The original pre-conflict base snapshot is **deleted and replaced** with whatever is currently in the data store. If `processVersionConflicts` has already written its merged `newData` back (in `sw.data.conflicts.js`), the new snapshot is the *partially-merged result*, not the original pre-conflict state. The next backoff iteration will do a 3-way merge with a corrupted base.

**`STALE_BASE_LIFESPAN` is 60 seconds.** The maximum total backoff time with `conflictMaxRetries=7` and `conflictBackoffMax=8000ms` plus jitter could be:

```
Retry 1: ~200ms   Retry 2: ~400ms   Retry 3: ~800ms
Retry 4: ~1600ms  Retry 5: ~3200ms  Retry 6: up to ~16000ms (capped 8000+jitter)
Retry 7: up to ~16000ms
Total worst case: ~43 seconds
```

That is well under the 60-second stale lifespan for a single backoff sequence. **So for a single conflict document, Case C is unlikely to trigger within one run.** However:

- If the app has been open a long time before the backoff starts (base snapshot is already old when conflict begins)
- If the clock skew is off
- If a prior batching window's `may-update` created the base snapshot well before the conflict was detected

...then the timestamp on the base could be close to or past 60s when the backoff timer fires the later retries.

---

## The More Immediate Problem: The `newData` Write + Next `may-update`

This is the sharper hazard and doesn't require stale base to trigger.

The sequence in `processVersionConflicts` (non-failure path):

1. **Reads** `baseStore` snapshot for the 3-way merge basis ✓
2. **Writes** merged `newData` back to the data store (`db.put`) — the data store now holds the merged result
3. **Starts the backoff timer** — control returns, the backoff delay begins
4. ⚡ **User makes a mutation** during the delay
5. `queueMutation` → `may-update` → `_mayUpdate` for the same collection
6. `_mayUpdate` finds the existing `baseCopy` — it is NOT stale (timestamp is still fresh)
7. If the new mutation op == existing base op → **SAFE: no change to base** (Case A)
8. If the new mutation op != existing base op → **SAFE for base content, but reference increments** (Case B)

So far so good for the base content. But then:

9. The new mutation is also added to `batchStore` via `batch-update`
10. The backoff timer fires → `completeProcessVersionConflicts` → `processBatchUpdates`
11. `processBatchUpdates` reads the `batchStore` — it now sees **both** the original conflict retry batch records **and the new mutation batch records**
12. `processBatchUpdates` sends both to the network, POSTing the conflict-retried document with the new user mutation bundled in
13. If this succeeds → `storeAndBroadcastMutation` → `clearBaseStoreRecords` is called
14. `clearBaseStoreRecords` decrements reference by 1 per call — but reference was incremented to 2 in step 8
15. The base record **survives** (reference = 1) — **but the conflict is resolved, so there is no next consumer of that base record**

**This is a reference count leak.** The base record will persist until `STALE_BASE_LIFESPAN` expires and the next `may-update` for that `storeType+document+collection` resets it. Not catastrophic, but wasteful and potentially confusing for debugging.

---

## The Real Threat: Interleaved `processVersionConflicts` Invocations

The true danger is this invocation path from `versionConflict` (in `sw.data.js`):

```
dataAPICall → versionConflict → storeVersionConflict → processVersionConflicts
```

During the backoff window, if a **second independent mutation** for the **same document** completes and also hits E_CONFLICT, `versionConflict` is called again, which calls `processVersionConflicts` again. This second invocation:

1. Reads the `conflictStore` (now has both the old and new conflict records)
2. Reads the `baseStore` — still the original-ish snapshot (or the partially-merged state from step 2 above)
3. Does its own 3-way merge
4. Writes `newData` back to the data store **again** — clobbering the prior backoff's merged state
5. Starts a **new backoff timer** — the `startTimer` call with the same timer name `'conflict-timer-backoff'` will **replace the existing timer** (in `sw.timer.js`)

That last point is important: `startTimer` is idempotent by name — it calls `clearInterval` on the existing timer. So the old backoff timer is cancelled and a new one starts from the beginning with the freshly incremented `retryCount`. This is actually the designed behavior for conflict thrashing, but it means the window is extended further and the base read in step 2 of this second invocation is already looking at the partially-merged data, not the true original.

> '`conflict-timer-backoff`' requires immunity to user inactivity timer interruption. See the [Cooperative Timer `ignoreInactivity` Extension](#cooperative-timer-ignoreinactivity-extension)

---

## Summary of Risks, Ranked

| # | Scenario | Likelihood | Severity | AffiliatedLock | Sentinel |
|---|---|---|---|---|---|
| 1 | Second conflict for same doc during backoff → second `processVersionConflicts` interleaves, reads partially-merged `newData` | Medium (high-traffic) | **High** | ❌ Lock released before timer fires | ✅ Re-entry guard exits immediately |
| 2 | User mutation during backoff, same doc+op → `may-update` is a no-op (Case A) | Very common | None | — | — |
| 3 | User mutation during backoff, same doc, different op → reference count increments, base snapshot intact | Common | Low | — | — |
| 4 | Stale base (>60s) + `may-update` during backoff → base evicted and re-snapshotted from partially-merged state | Rare | High | ❌ Unrelated to batch lock | ✅ Case C suppressed |
| 5 | Reference count leak after Case B concurrent mutation resolves | Common | Low | — | — |

---

## How `AffiliatedLock` and `CONFLICT_SENTINEL` Divide Responsibility

The two primitives are **complementary, not redundant**. The dividing line is whether the backoff timer has fired.

**With `maxRetryCount > 0` (backoff path):** `processVersionConflicts` calls `startTimer(...)` and returns immediately. The chain unwinds — `versionConflict` → `dataAPICall` → `_processBatchUpdates` returns `E_CONFLICT` → `finally` releases the `AffiliatedLock`. The backoff delay begins with the lock **free**. A second mutation's batch-timer can now acquire the lock, run `_processBatchUpdates`, hit `E_CONFLICT`, and call `processVersionConflicts` again — **fully concurrent with the pending backoff timer**. The `AffiliatedLock` does not prevent this. The `CONFLICT_SENTINEL` does.

**With `maxRetryCount === 0` (immediate path):** `processVersionConflicts` awaits `completeProcessVersionConflicts` → `processBatchUpdates(affiliationId)` inline. The entire chain is awaited while the lock is still held. Any external batch-timer call queues at the lock boundary and cannot interleave. The `AffiliatedLock` fully covers this case.

**`_mayUpdate` / `baseStore`:** entirely decoupled from the batch lock. Whether or not the lock is held, `_mayUpdate` can fire from a main-thread `may-update` message and evict a stale base snapshot. The `CONFLICT_SENTINEL` is the only guard.

```
AffiliatedLock protects:          CONFLICT_SENTINEL protects:
  Concurrent _processBatchUpdates     Interleaved processVersionConflicts
  runs (timer vs. timer,              during backoff delay (Risk #1)
  timer vs. replay queue)
                                      Stale baseStore eviction via
  maxRetryCount=0 conflict path       _mayUpdate during backoff (Risk #4)
  (entire chain held under lock)
```

## The CONFLICT_SENTINEL Approach

A sentinel scoped to `storeType+document`, set at entry to `processVersionConflicts` and cleared only after the backoff timer fires and `completeProcessVersionConflicts` fully resolves. It serves **two distinct purposes**:

### Purpose 1: Serialize `processVersionConflicts` (primary)

If a new `E_CONFLICT` arrives for the same document while a backoff resolution is already in-flight, `versionConflict` calls `storeVersionConflict` (accumulating the new conflict data in `conflictStore` as normal) and then calls `processVersionConflicts`. With the sentinel set, **this second invocation exits immediately** — it does not merge, does not write `newData`, does not start a new timer.

The new conflict data sits safely in `conflictStore`. When the in-flight backoff timer eventually fires and `completeProcessVersionConflicts` → `processBatchUpdates` runs, if the retry hits `E_CONFLICT` again, `processVersionConflicts` is called fresh — now with the sentinel clear — and it reads all accumulated conflict records in one shot. This is the correct behavior: `conflictStore` is the durable buffer.

This also eliminates the interleaved-write problem described in Risk #1: the second invocation never gets to write a partially-merged `newData` over the data store.

### Purpose 2: Guard `baseStore` from stale re-snapshot

`_mayUpdate` checks the sentinel and, when active, **skips the delete + re-snapshot path** (Case C) even if the base is stale. If a `baseCopy` exists, only increment the reference count. If no `baseCopy` exists, leave `baseStore` alone — the mutation is still queued in `batchStore` and will be sent to the network after conflict resolution concludes with a post-resolution baseline.

### Shared semantics

- **User mutations are never blocked** — `batchStore` additions proceed normally. The sentinel only touches `processVersionConflicts` re-entry and `baseStore` behavior in `_mayUpdate`.
- **Scoped** to `storeType+document` (not collection, since conflict resolution operates at the document level)
- **In-memory only** (not IDB) — if the SW is killed during a backoff delay, the sentinel resets cleanly. Conflict records survive in `conflictStore` and are picked up by `replayRequestQueue` on restart, which calls `processVersionConflicts` fresh with no sentinel.
- **Cleared** on both success and failure exits, **after** `completeProcessVersionConflicts` fully resolves (inside the timer callback, not just after `startTimer` returns)

### Lifecycle

```
processVersionConflicts starts:
  → if sentinel already set for this doc: EXIT IMMEDIATELY (new conflicts are in conflictStore)
  → setConflictSentinel(storeType, document) for each doc in conflictStore

versionConflict (new E_CONFLICT for same doc during backoff):
  → storeVersionConflict(...) runs normally — conflict data accumulates in conflictStore ✓
  → processVersionConflicts called → sentinel check → exits immediately ✓

_mayUpdate (any mutation during backoff):
  → if sentinel set for this doc:
       Case C (stale base): SKIP delete + re-snapshot. Increment refcount if baseCopy exists.
                            If no baseCopy: do NOT create one.

completeProcessVersionConflicts (fires when backoff timer expires):
  → processBatchUpdates() runs
  → if new E_CONFLICT: processVersionConflicts called again — sentinel is STILL set
     → Sentinel check: but this is the legitimate continuation, so the sentinel should be
        cleared BEFORE this call, then set again if a new conflict is triggered
  → sentinel cleared for all docs in this resolution batch
```

> [!IMPORTANT]
> The clean sentinel clear point is **after `processBatchUpdates()` returns inside `completeProcessVersionConflicts`**, not before. The call chain becomes: timer fires → clear sentinels → `processBatchUpdates` → if new E_CONFLICT → `processVersionConflicts` → sets new sentinels → new backoff. This ensures the sentinel never blocks the legitimate continuation.

### For the max-retries-exceeded case

On failure exit, clearing the sentinel allows the next `may-update` to snapshot the current data store state (which is still the un-merged local state since max-retry failure doesn't write `newData`). Combined with the previously discussed `refreshData` + re-queue approach on failure, this means:

1. Sentinel is cleared after max-retries failure
2. `refreshData` is called → updates data store with server state → `storeData` fires `sendMessage`
3. First new user interaction → `may-update` → snapshots the now-fresh server state as the new baseline ✓

---

## Implementation — Final State

### `sw.data.helpers.js` — sentinel exports

```js
// In-memory sentinel: Set of 'storeType:document' keys under active conflict resolution
const conflictSentinel = new Set();

export function setConflictSentinel(storeType, document) {
  conflictSentinel.add(`${storeType}:${document}`);
}
export function clearConflictSentinel(storeType, document) {
  conflictSentinel.delete(`${storeType}:${document}`);
}
export function isConflictSentinel(storeType, document) {
  return conflictSentinel.has(`${storeType}:${document}`);
}
```

### `sw.data.helpers.js` — `_mayUpdate` sentinel guard (both paths symmetric)

**Collection path** — sentinel check short-circuits if no `baseCopy` exists (since `staleBase` would also be false):
```js
const staleBase = baseCopy && (Date.now() - baseCopy.timestamp) >= STALE_BASE_LIFESPAN;
const protectedByConflict = baseCopy && isConflictSentinel(storeType, document);
const willDelete = (staleBase && !protectedByConflict) || clearOnly;
```

**Document path** — sentinel hoisted before the cursor loop, applied per-item:
```js
const protectedByConflict = isConflictSentinel(storeType, document);
for await (const cursor of documents.iterate([storeType, document])) {
  const staleBase = Date.now() - item.timestamp >= STALE_BASE_LIFESPAN;
  if ((staleBase && !protectedByConflict) || clearOnly) {
    deleteCount++;
    await cursor.delete();
  }
}
```
`clearOnly = true` (called from `storeAndBroadcastMutation` on successful mutation) correctly bypasses sentinel protection in both paths — that is intentional forced teardown, not a stale eviction.

In `processVersionConflicts`, guard re-entry and bracket the work:

```js
// Guard re-entry: exit immediately if sentinel active for any involved doc
for (const { storeType, document } of storeTypeDocuments) {
  if (isConflictSentinel(storeType, document)) return;
}

// Set sentinels for all involved documents
for (const { storeType, document } of storeTypeDocuments) {
  setConflictSentinel(storeType, document);
}

// ... merge work ...

// Failure path (max retries exceeded): delegate to failProcessVersionConflicts
if (maxRetryCount >= conflictMaxRetries) {
  return failProcessVersionConflicts(allConflictValues, resetRetries, clearConflictSentinels, refreshData, meta);
}

// Success path: sentinels cleared inside completeProcessVersionConflicts cleanup callback
await completeProcessVersionConflicts(instanceId, message,
  () => processBatchUpdates(affiliationId),  // affiliated re-entry
  clearConflictSentinels                     // called before processBatchUpdates inside complete
);
```

And `completeProcessVersionConflicts` calls its cleanup callback **after** `processBatchUpdates()` returns:

```js
async function completeProcessVersionConflicts(instanceId, message, processBatchUpdates, cleanup) {
  cleanup(); // clear sentinels BEFORE processBatchUpdates so new conflicts can re-enter
  const result = await processBatchUpdates();
  // ... send success messages ...
}
```

> [!IMPORTANT]
> Sentinels must be cleared **before** `processBatchUpdates()` inside `completeProcessVersionConflicts`. This allows a new `E_CONFLICT` from that call to legitimately re-enter `processVersionConflicts` and set fresh sentinels for the next backoff round.

> [!NOTE]
> This in-memory sentinel does not survive a SW restart. Conflict records survive in `conflictStore` and are picked up by `replayRequestQueue` on restart, which calls `processVersionConflicts` fresh with no sentinel and `retryCount` reset.

### `sw.utils.js` — `AffiliatedLock` and `sendBeacon`

Both the `AffiliatedLock` class and the `sendBeacon` fire-and-forget utility live in `sw.utils.js`. `sendBeacon` uses `fetch` with `keepalive: true` (the correct SW substitute for `navigator.sendBeacon`, which is unavailable in SW context) posting to `/api/metrics`.

---

## Serializing `processBatchUpdates` with `AffiliatedLock`

### Why plain `CriticalSection` fails: deadlock

A naive `CriticalSection` wrapper on `processBatchUpdates` deadlocks immediately on the first conflict. The `maxRetryCount === 0` call chain is fully awaited top-to-bottom on the same call stack:

```
CriticalSection [lock=true] → _processBatchUpdates()
  → upsertData()
    → dataAPICall() → 409 versionError
      → await versionConflict()
        → await processVersionConflicts()
          → await completeProcessVersionConflicts()   [maxRetryCount === 0]
            → await processBatchUpdates()
              → CriticalSection.execute()  ← lock still true → DEADLOCK
```

The inner `processBatchUpdates` call queues behind the outer one, which is itself awaiting the inner one. Neither proceeds.

### The `AffiliatedLock` primitive

A **reentrant mutex with explicit capability tokens**. In traditional threading, a `PTHREAD_MUTEX_RECURSIVE` uses thread identity implicitly as the affiliation credential. In JavaScript's cooperative async model there are no thread IDs, so affiliation is **explicit**: a caller presents a `BATCH_PROCESS_ID` (a `Symbol`) to prove descent from the current lock holder and re-enter without waiting.

```
acquire(affiliationId?)
  → affiliationId matches heldId: re-entry granted, return same id (no-op on lock state)
  → heldId is null: issue new Symbol id, hold lock, return id
  → else: enqueue, wait, receive new id atomically when granted

release(id)
  → queue has waiters: pre-assign new heldId *before* resolving next waiter (closes the window)
  → else: heldId = null
```

The new `heldId` is assigned before resolving the next waiter's promise to eliminate a window where a third caller could incorrectly win a null `heldId`.

```js
class AffiliatedLock {
  constructor () {
    this.heldId = null;
    this.queue = [];
  }

  acquire (affiliationId = null) {
    if (affiliationId !== null && affiliationId === this.heldId) {
      return Promise.resolve(affiliationId);         // affiliated re-entry
    }
    if (this.heldId === null) {
      this.heldId = Symbol('batch-process-id');
      return Promise.resolve(this.heldId);           // free: take immediately
    }
    return new Promise(resolve => this.queue.push(resolve)); // enqueue: receive id when granted
  }

  release (id) {
    if (id !== this.heldId) return;
    if (this.queue.length > 0) {
      this.heldId = Symbol('batch-process-id');      // pre-assign atomically
      this.queue.shift()(this.heldId);               // wake next with their new id
    } else {
      this.heldId = null;
    }
  }
}
```

### `processBatchUpdates` wrapper

```js
// sw.data.js
const alBatchUpdate = new AffiliatedLock();

async function processBatchUpdates (affiliationId = null) {
  const lockId = await alBatchUpdate.acquire(affiliationId);
  const isOwner = lockId !== affiliationId;

  try {
    return await _processBatchUpdates(lockId);  // thread id down
  } finally {
    if (isOwner) alBatchUpdate.release(lockId);
  }
}
```

External callers (batch-timer, `replayRequestQueue`) call `processBatchUpdates()` with no argument — they queue and wait their turn. Affiliated callers present `lockId` — they re-enter without waiting. Unaffiliated calls during active execution correctly wait.

### `affiliationId` threading through the call chain

The id must travel from `_processBatchUpdates` all the way to the re-entrant `processBatchUpdates()` call inside conflict resolution:

```
_processBatchUpdates(affiliationId)
  → upsertData(request, { affiliationId })
    → dataAPICall(...) → 409
      → versionConflict(metadata, { affiliationId })
        → processVersionConflicts({
            processBatchUpdates: () => processBatchUpdates(affiliationId),  ← affiliated
            addToBatch: conditionalBatchUpdate
          })
          → completeProcessVersionConflicts(instanceId, message, processBatchUpdates)
            → processBatchUpdates(affiliationId)  ← re-enters with credential, no wait
```

The bound `() => processBatchUpdates(affiliationId)` is what gets passed as the `processBatchUpdates` parameter into `processVersionConflicts` and bound into the backoff timer callback via `completeProcessVersionConflicts.bind(...)`. All downstream calls carry the affiliation forward automatically.

> [!NOTE]
> The batch-timer callback in `_batchUpdate` calls the unaffiliated `processBatchUpdates()` (no argument). This is correct — a timer-triggered run is a new top-level execution and should queue behind any in-flight affiliated run.

---

## `failProcessVersionConflicts` — Max Retries Exceeded

When `maxRetryCount >= conflictMaxRetries`, `processVersionConflicts` delegates immediately to `failProcessVersionConflicts` before doing any merge work. The function accepts the same closure-bound helpers (`resetRetries`, `clearSentinels`, `refreshData`) plus a `meta` object for telemetry.

**Cleanup ordering (all IDB, no network):**
1. Delete all `conflictStore` records for this conflict set
2. Clear conflict sentinels (`clearSentinels()`)
3. Reset version retry counts (`resetRetries()`)
4. Clear `baseStore` records via `mayUpdate({...}, clearOnly=true)` per conflict collection — uses the `csMayUpdate` CriticalSection, correctly passes `collection_name`
5. Delete `batchStore` records for conflicting collections via the `'record'` index prefix scan: `IDBKeyRange.bound([storeType, document, collection], [storeType, document, collection, '\uffff', '\uffff'])` — collection-scoped, avoids over-deleting unrelated pending mutations on the same document

**Network refresh (after IDB is clean):**

Group `allConflictValues` by unique `storeType+document`, collecting all conflicting `collection_name` values into an array. One `refreshData` call per document with `forceRemote: true` and an `asyncResponseHandler` that calls `storeData` with the error message on the last document only.

```js
const docMap = new Map();
for (const val of allConflictValues) {
  const key = `${val.storeType}:${val.document_name}`;
  if (!docMap.has(key)) docMap.set(key, { storeType: val.storeType, document: val.document_name, collections: [] });
  docMap.get(key).collections.push(val.collection_name);
}
const docEntries = [...docMap.values()];
const lastIndex = docEntries.length - 1;
for (let i = 0; i < docEntries.length; i++) {
  const { storeType, document, collections } = docEntries[i];
  await refreshData({ storeType, document, collections }, {
    forceRemote: true,
    asyncResponseHandler: data => storeData(storeType, data, i === lastIndex ? errorMessage : null)
  });
}
```

- `collections` as array → single-collection produces `/${document}/${col}` URL; multi-collection produces `/${document}?collections=...` — only conflicting collections are overwritten, non-conflicting collections on the same document are untouched
- `storeData` with `message` param sends the error toast on the last `database-data-update` only
- `forceRemote: true` bypasses the `hasPendingUpdates` guard and sets `staleResponse: null`

**Telemetry:**

To track the frequency and severity of conflicts experienced by users in the system, metrics are sent to the service on conflicts that require retries for tracking service quality. High conflict retry counts will indicate high traffic, high write conditions. Ongoing or growing problems will indicate this multi-user optimistic concurrency control design is failing real world application usage, and other designs (such as CRDT type solutions) may be more appropriate.

---

## Cooperative Timer: `ignoreInactivity` Extension

### The Two-Timer Semantic Split

The cooperative heartbeat timer system is used for two distinct timers with opposite inactivity semantics:

| Timer | Inactivity behavior | Rationale |
|---|---|---|
| `batch-timer` | Fire **early** when user goes idle | User stepping away = good time to flush pending mutations |
| `conflict-timer-backoff` | **Ignore** user idle state | Retry timing is a data integrity concern; idle user ≠ intent to abort |

Without an explicit override, the `checkHeartbeat` path in `sw.timer.js` treats all-clients-inactive as a signal to fire the timer immediately. For `conflict-timer-backoff`, this is incorrect — a user sitting still reading content while a conflict resolves in the background has no bearing on when the retry should fire.

### What `ignoreInactivity` Governs

Pass `ignoreInactivity = true` as the fifth argument to `startTimer`:

```js
// sw.data.conflicts.js — inside processVersionConflicts
await startTimer(delay, 'conflict-timer-backoff',
  completeProcessVersionConflicts.bind(null, instanceId, message, processBatchUpdates, cleanup),
  resolution,
  true  // ignoreInactivity
);
```

**`sw.timer.js` changes:**
- `startTimer`: accepts `ignoreInactivity = false`, stores on `timers[timerName]`, passes through `startHeartbeat` message payload
- `checkHeartbeat`: skips `inactiveCount === clientCount` branch when `ignoreInactivity` is set — only heartbeat freshness (SW still alive) gates the timer

```js
return (ignoreInactivity || inactiveCount !== clientCount)
  && Date.now() - lastTime <= resolution;
```

**`heartbeat.js` changes:**
- `heartbeatStart`: stores `ignoreInactivity`, skips `userActivityStart`, always sends `inactive: false` in the periodic beat
- `heartbeatStop`: guards `userActivityStop` call (skips if `ignoreInactivity`, since listeners were never added)
- `swMessageHandler`: threads `payload.ignoreInactivity` through to `heartbeatStart`

### What `ignoreInactivity` Does NOT Change

**`visibilityHandler` is unchanged.** When `document.visibilityState === 'hidden'` (minimized/closed), the browser signals that the SW may be killed imminently. All timers — including `conflict-timer-backoff` — are stopped and the SW is asked to service them immediately via `service-timers-now`. This is the fundamental purpose of the cooperative timer design: "fire now rather than not at all" before the process dies.

The `visibilitychange` → hidden event is not inactivity — it is a process lifecycle signal. Servicing the backoff timer at that point is correct best-effort behavior. The `conflictStore` records are durable in IDB and survive a SW restart, so a premature fire on hide is safe: the callback runs `completeProcessVersionConflicts` → `processBatchUpdates`, which either succeeds (good) or re-conflicts and restarts from `conflictStore` on next opportunity.

> [!IMPORTANT]
> `ignoreInactivity` suppresses only the false-positive idle signal during normal operation (no mouse/keyboard events ≠ SW about to die). It never suppresses the visibility-hidden service-now path, which is the genuine "act before death" signal.
