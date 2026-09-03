# Scaling-laws experiments

Benchmark harness + raw results for the "Scaling laws for vector search" post,
mirrored from the AWS sandbox `tpuf-bench:~/bfb-bench/` (so they aren't stuck on an
ephemeral box).

- `scripts/` — bfb + dbpedia drivers and sweep runners. Run from a dir with a `.env`
  holding `QDRANT_CLUSTER_URL` (gRPC `:6334`) + `QDRANT_API_KEY`. **`.env` is never committed.**
- `results/` — raw CSV outputs from the runs.
- `prediction-plan.md` — cores→throughput prediction plan + run log.

Server under test: Qdrant Cloud **2 vCPU / 8 GiB** quota (on a 16-core/64 GB ARM host);
client/driver: `tpuf-bench` 2-vCPU EC2. REST is `:6333`, gRPC is `:6334`.
