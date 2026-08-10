# Predicting Qdrant performance from cores — measurement plan

Goal: given a machine's core count, **predict its max throughput and its minimum
achievable latency** from a concurrency/RPS sweep. Make the scaling-laws benches
capable of that prediction (and validate it), instead of reporting single-point
latencies at a fixed concurrency.

---

## 0. Ground truth measured today (the boxes in the loop)

| Role                     | Machine                                                                 | CPU                                                | RAM                               | Notes                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Local dev                | this laptop                                                             | Intel Core Ultra 7 155H — 22 logical / 16 physical | 15 GB                             | runs a local Qdrant 1.16.3 (token-storage work); **not** the bench server                                                                     |
| **Client / load driver** | `tpuf-bench` (AWS EC2, us-west-2)                                       | **2 vCPU** Xeon 8259CL @2.5 GHz                    | 7.6 GB                            | **undersized**; also runs the `tans-bench` token job (load ~1.2) → contended                                                                  |
| **Server under test**    | Qdrant Cloud cluster `e71e8d92…us-west-2-0.aws.cloud.qdrant.io`, 1 node | **2 vCPU** (arch unconfirmed)                      | **8 GiB** (+32 GiB balanced disk) | CONFIRMED from Cloud console. Blog's "16-core/64 GB ARM" is **WRONG** on all counts; currently cluttered with ~100 collections (not isolated) |

### What the real 2 vCPU / 8 GiB spec changes (major blog corrections)

1. **"16-core / 64 GB ARM" → 2 vCPU / 8 GiB.** Every scaling-laws number was
   measured on a _tiny 2-core_ server. The client (2 vCPU) is actually well-matched.
2. **"vectors in RAM" is false at large N.** 10M×256 fp32 = **10.24 GB > 8 GiB** →
   spilled to the balanced disk. 5M fp32 = 5.1 GB (fits, but +HNSW pressures 8 GB).
   This explains the **non-monotonic fp32 curve and the 2 h indexing timeout at 10M**
   — those points were **disk-bound**, not RAM-resident. BQ (10M = 320 MB) always
   fits → its clean scaling.
3. **8 segments on 2 vCPU = 4× oversubscription** → per query spawns 8 tasks
   fighting 2 cores; explains the ~170 rps brute-force ceiling. Segments should
   ≈ cores.
4. **For core-scaling prediction:** server = 2 cores ⇒ saturation knee at ~2
   in-flight (matches Run-3 data). To fit/validate a cores→throughput model we must
   **resize the cluster vCPU (e.g., 2 → 4 → 8)**.

## Port gotcha (2026-07-17) — the "unresponsive cluster" was a misdiagnosis

`.env` `QDRANT_CLUSTER_URL` uses **`:6334` (gRPC)**. REST tools (`curl`, `QdrantClient`
in REST mode) hitting a gRPC port get **`HTTP 200`, 0-byte body** → JSONDecodeError,
which looked like a dead cluster. **REST lives on `:6333`** and works fine (Qdrant
1.18.2). bfb uses gRPC (:6334) correctly, so all sweep data is valid, and nothing was
"tipped over." HARNESS FIX: script cleanup `curl -X DELETE` must target `:6333`
(the ones using `:6334` were silent no-ops → leaked exp\_\* collections).

## Run 4 — CLEAN 2-vCPU baseline (2026-07-17): client idle, junk gone, wall-clock throughput

100k×256 fp32 brute-force, 8 segments, `-c 4`, closed-loop:

| p   | true rps | srv p50 (ms) | srv p95 | srv p99 | client CPU% |
| --- | -------- | ------------ | ------- | ------- | ----------- |
| 1   | 102      | **1.35**     | 1.42    | 1.47    | 46          |
| 2   | 129      | 1.88         | 14.7    | 56      | 47          |
| 4   | 134      | 9.14         | 56      | 77      | 52          |
| 8   | 152      | 26.7         | 84      | 87      | 49          |
| 16  | 172      | 71.4         | 92      | 102     | 48          |
| 32  | **181**  | 147          | 175     | 198     | 48          |

**Baseline extracted (the two prediction targets):**

- **Min-latency floor R0 = 1.35 ms** server-side (single query); ~10 ms end-to-end
  (network to the cloud LB dominates the client-observed floor).
- **Max throughput Xmax ≈ 180–200 rps** (plateauing; monotonic now — no retrograde).
- **Server-bound**: server p50 climbs 1.35 → 147 ms while throughput plateaus; client
  CPU flat ~48% → client is NOT the limit. Well below the naive 2-core ceiling
  (~1480 rps) because of the 8-segment fan-out + per-query fixed cost.

**Falsifiable prediction to validate by resizing:** if Xmax scales ~linearly with
vCPU, expect ~**360 rps @ 4 vCPU** and ~**720 rps @ 8 vCPU**, with R0 roughly flat (or
dropping as a single query fans over more cores). Resize → re-run → check.

**Correction (confirmed by user, 2026-07-17):** Qdrant's core logic uses the REAL
CPU quota (2 vCPU) for its thread pools — it does NOT over-thread to 16. Only the
telemetry `system.cores` field misreports the host (16-core/64 GB ARM, neon/fp16).
So the ~170 rps ceiling is just a small 2-core server, not self-inflicted
oversubscription. Arch = **ARM** (neon). Blog "16-core/64 GB" = the host, not the
2 vCPU / 8 GiB quota that governs performance.

**Three problems this exposes, all of which invalidate current throughput numbers:**

1. **The client can't saturate the server.** A 2-vCPU driver cannot push enough
   concurrent load to saturate a ~16-core server. Every `req/s` we've reported is
   potentially **client-bound**, not server-bound.
2. **The server's real core count is unverified.** The whole "predict from cores"
   thesis needs a known denominator.
3. **The cluster isn't isolated** (~100 `mtx-s3-*` + `reproduce-*` collections),
   so latencies drift (10k brute-force went 8 ms → 70 ms between runs).

---

## 1. The model we're fitting (what "prediction power" means)

Every operating point obeys **Little's Law**: `N = X · R`
(concurrency = throughput × latency).

Sweeping concurrency `N` traces three regimes:

- **Linear / underloaded:** `R ≈ R0` (flat, = single-request service time),
  `X = N / R0` (throughput rises linearly).
- **Knee:** around `N* ≈ cores` (for CPU-bound work), cores fill up.
- **Saturated:** `X ≈ Xmax` (plateau), `R ≈ N / Xmax` (latency rises linearly with load).

Fit the **Universal Scalability Law** to the sweep:

```
X(N) = N / (1 + α(N−1) + βN(N−1))
```

- `α` = contention (serialization), `β` = coherency/crosstalk.
- `Xmax` and `N_peak = sqrt((1−α)/β)` fall out of the fit.

Predictors we extract:

- **Min latency** = `R0` (throughput→0, single in-flight request) — the floor.
- **Max throughput** `Xmax`, and per-core service demand `D` (`Xmax ≈ cores / D`).
- **Prediction vs cores:** fit `D`, `α`, `β` at 2–3 known core counts, then predict
  `Xmax(c) ≈ c/D` and the full latency curve for an arbitrary `c`; validate on a
  held-out core count. Cross-check latency-vs-utilization against **M/M/c**.

Nice side effect: the saturation knee **measures the server's effective core
count** — so the sweep answers the "how many cores does this Qdrant really have"
question we couldn't get from telemetry.

---

## 2. Harness changes (extend `bfb_bench.py` / `dbpedia_bench.py`, don't fork)

1. **Concurrency sweep.** Replace fixed `-p 8` with a sweep
   `p ∈ {1,2,4,8,16,32,64,128,256}` per cell; record for each: throughput (rps),
   server p50/p95/p99, client-observed latency.
2. **Capture utilization at every point** — server CPU% (Cloud monitoring or
   `/metrics` if exposed) **and** client CPU% (`mpstat`/psutil). Utilization is
   what proves whether the server or the _client_ is the bottleneck.
3. **Guardrail:** if client CPU saturates before the server does, flag the point
   as client-bound and exclude it (or scale out to multiple driver boxes).
4. **Warmup + steady-state + repeats** (≥3×, report median + CI) — retires the
   "single run — treat as preliminary" caveat.
5. **Isolated, known-spec server**, single tenant, empty except the test
   collection; record exact vCPU/RAM/arch, Qdrant version, HNSW `m`/`ef_construct`,
   search `ef`.
6. **Open-loop RPS sweep** (Poisson arrivals at target rps) as a complement to
   bfb's closed-loop model — closed-loop finds the knee, open-loop finds where
   latency explodes vs offered load. (bfb is closed-loop; may need a small async
   generator for this.)
7. **Vary server cores** (resize cluster 4 → 8 → 16 vCPU) to fit `D`, `α`, `β` and
   validate the prediction on a held-out size.

---

## 3. Experiment matrix

- **Server cores:** {4, 8, 16} vCPU — 3 points (2 to fit, 1 to validate).
- **Concurrency:** 1 → 256 (log₂ steps).
- **Fixed:** dataset size (e.g. 1M) + dim + HNSW params + search `ef`; sweep only concurrency.
- **Modes:** fp32 and binary-quant (BQ is far less bandwidth-bound → different `β`).
- **Repeats:** 3×, median + 95% CI.

---

## 4. The deliverable (prediction test)

- Fit USL per core-count; overlay measured vs USL curve.
- Predict `Xmax` and the latency-vs-load curve for the **held-out** core count;
  report prediction error.
- Blog payoff: _"Give me C cores → expect `Xmax ≈ C/D` req/s and a `R0` ms latency
  floor; here's the fit and the validation."_ That's the prediction power.

---

## 5. Blockers to clear before real runs

- [ ] **Server cores/RAM/arch** — get from Qdrant Cloud console (or a cloud API key), or derive from the saturation knee.
- [ ] **Isolated cluster** — clean `mtx-s3-*` (junk) and decide on `reproduce-*`, or provision a fresh dedicated cluster.
- [ ] **Adequate, idle client** — 2 vCPU is too small and is running the token job; need a bigger driver or multiple drivers, kept otherwise idle.
- [ ] Confirm arch (ARM Graviton vs x86) — affects SIMD/per-core service time.

## 6. Sequenced next steps

1. Stand up an isolated, **known-spec** cluster + an idle client with cores ≥ server.
2. Baseline concurrency sweep at ONE core count → validates harness end-to-end and reveals effective cores.
3. Repeat at 2 more core counts.
4. Fit USL / M/M/c, validate prediction on held-out cores, write the section.

---

## Run 1 — closed-loop concurrency sweep (MEASURED, 2026-07-17)

100k×256 fp32 **brute-force** (no index), client `tpuf-bench` (2 vCPU), current
(contended) cluster. Swept `-p`:

| p   | srv p50 (ms) | srv p95 | srv p99 | avg rps        | client CPU% (of 2 cores) |
| --- | ------------ | ------- | ------- | -------------- | ------------------------ |
| 1   | 1.35         | 1.42    | 1.47    | 73             | 48                       |
| 2   | 1.38         | 2.67    | 14.7    | **138** ← peak | 51                       |
| 4   | 10.5         | 23.5    | 62      | 129            | 51                       |
| 8   | 25.8         | 67.7    | 85      | 118            | 55                       |
| 16  | 64           | 96      | 108     | 100            | 51                       |
| 24  | 99           | 145     | 186     | 92             | 52                       |
| 32  | 136          | 190     | 201     | 76             | 55                       |
| 48  | 217          | 284     | 304     | 73             | 54                       |
| 64  | 293          | 347     | 437     | 60             | 64                       |
| 96  | 458          | 550     | 606     | 56             | 56                       |
| 128 | 613          | 694     | 753     | 51             | 64                       |

**Findings:**

- **Throughput peaks at p=2 (~138 rps) then _declines_ monotonically** — a healthy
  server-bound curve rises to a plateau; a curve that peaks-then-falls is the
  classic signature of a **client-limited / retrograde** system, not the server.
- **At p=1, server does the work in 1.35 ms but achieved throughput is 73 rps =
  13.7 ms/request** → ~12 ms/request is client + transport overhead. That per-request
  client cost on 2 cores is what caps aggregate throughput at ~140 rps.
- So **the 2-vCPU client is the bottleneck**, not the server. The "server latency
  ballooning" at high p is just queuing behind the client's inability to drain.
- Server-side signal: a _single_ brute-force query returns in 1.35 ms across 8
  segments → the server parallelizes one query over ≥8 cores (consistent with the
  claimed ~16, can't pin exactly while client-capped).
- Confounds to control next: contended cluster; `-t` capped at 8; 8-segment
  fan-out makes 1 query already ~8-way parallel.

## Run 2 — RTT floor + open-loop + wall-clock throughput (2026-07-17)

- **RTT floor to cluster:** reused connection **p50 = 3.7 ms**; **fresh TLS
  handshake = 75 ms** (min 28). Connection reuse is decisive.
- **Open-loop `--rps` sweep** (`-c 64`): server p50 stays ~1.5 ms at 200 rps,
  jumps to 115 ms at 400, 5.5 s at 800, 8 s at 1600 → server latency explodes
  by a few hundred rps. Client CPU stayed 62–77% (of 2 cores), never pinned.
- **True throughput (wall-clock Q/t), p=4, 3000 queries:** **23 rps**, wall 130 s,
  server p50 10 ms, **client CPU 81%**. Server-reported 10 ms × 4 concurrent
  predicts ~400 rps, but true was 23 rps → ~170 ms of NON-server time per query.

### Conclusions / harness defects found

1. **bfb "Avg rps" is NOT aggregate throughput** — must compute `queries/wallclock`.
2. **~170 ms/query overhead with only 10 ms server + 81% client CPU** ⇒ the client
   is almost certainly **not reusing connections** (paying ~75 ms TLS/request) and/or
   is contended (it's ALSO running the `tans-bench` token job).
3. Server cluster is contended (~100 collections).
   ⇒ **We cannot measure the server's core-scaling yet** — every number is dominated
   by transport/client-contention artifacts, not server cores. Fix connection
   reuse + idle+isolated client + isolated server + wall-clock metric FIRST.

## Run 3 — connection reuse + idle client (2026-07-17, RESOLVED the client question)

Protocol: **gRPC over TLS (:6334)**, cluster behind a public LB (54.214.99.95).
Token job (`tans-bench`) now idle → client genuinely idle.

Wall-clock true throughput, 100k×256 brute-force, client idle:
| config | true rps | server p50 | TCP conns to cluster |
|---|---|---|---|
| p=32, c=32 | 157 | 144 ms | ramped to ~96 (≈3×c) |
| p=16, **c=4** | **176** | 67 ms | max 12 (≈3×c) |
| p=16, c=16 | 156 | 68 ms | max 49 (≈3×c) |

**Findings (client question fully answered):**

- **gRPC multiplexes fine: `-c 4` matches `-c 16` throughput** (176 vs 156). A tiny
  pool is plenty — no need for many connections or a big client. bfb opens ~3 TCP
  per `-c` channel, stable (the earlier "climb to 96" was just 3×32, not a leak).
- **Idling the client tripled throughput** (23 → ~170 rps). The client was never
  short on cores — it was contended by the token job.
- **The bottleneck is the SERVER**: p50 jumps 1.4 ms (single) → 67 ms (p=16) →
  144 ms (p=32); throughput tops out ~160–176 rps for this brute-force workload on
  the **contended** cluster.

**Bottom line:** client cores / connection reuse are NOT the limit — resolved. Use
a small pool (`-c 4–8`), keep the client idle. The ONLY remaining blocker for
core-scaling prediction is an **isolated server with known core count**.
