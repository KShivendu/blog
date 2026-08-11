# token-search.mdx — v2 plan: incorporate the R3–R5 result (reaches a stemmed analyzer)

SUPERSEDES the trim-only plan. The blog's old climax ("can't beat BM25 / a hair behind Porter")
is now stale. Rounds 3–5 found the token-native recipe that CLOSES the Porter gap.

## The honest claim (do NOT overclaim — this is the crux)

- Base normalized token-BM25 = within noise of a plain word analyzer (unchanged, still true).
- The one gap was Porter STEMMING (~−0.02, precision at the top). Two token-native fixes close it:
  1. UN-FRAGMENTATION — treat each word as one atomic term (word_tuple), or group its subwords
     under one word-level IDF + squared bag-coverage (GroupCov). Fixes the IDF-budget inflation
     from splitting rare words into subwords.
  2. SOFT-STEMMING VIA WEIGHTED EXPANSION — expand each query word to its stem-group variants,
     weighted by attestation df_v/(df_v+k\*df_q), max-scored. Recovers Porter's morphological
     matching with NO hard merge. (The SPLADE view: stemming = strong-weighted expansion with
     CLEAN candidates; usable weight is bounded by candidate precision.)
- RESULT (o200k, 12 NanoBEIR, cluster bootstrap):
  normalized token 0.5219
  word_tuple+freq+stop 0.5454 (ties word_en; SIGNIFICANTLY beats plain token-BM25)
  GroupCov+freq+stop 0.5471 (best; nominally ABOVE word_en on NDCG@10/@100/MRR, wins 7/12 ds)
  word_en (Porter+stop) 0.5446 (the target)
- HONEST verdict: token-native REACHES / TIES word_en (every per-query CI vs word_en crosses 0),
  nominally edges it, and SIGNIFICANTLY beats plain token-BM25. NOT a significant win over word_en
  yet (needs full-BEIR). Say "reaches/matches, nominally ahead", not "beats".
- Caveat to keep: the precision recipe uses Porter (for candidate grouping) + a stopword list, so
  it is NOT the config-free story — that's still the multilingual result. Point is: soft expansion
  > = hard stemming on equal footing, token-natively, no GPU.

## Structural changes

1. Intro: rewrite. Lead: token-native BM25 matches a plain analyzer, REACHES a Porter-stemmed one
   with two token-native fixes, and wins multilingual/config-free.
2. Keep naive-broken -> normalized -> ladder -> within-noise. Reframe the char-n-gram beat: the
   base IS char-n-gram IR (matches plain word); its free stemming is PARTIAL -> that's the Porter
   gap -> which the new section closes. (char-n-gram insight stays, "use a stemmer" conclusion goes.)
3. Recall ceiling: keep (already trimmed).
4. NEW centerpiece "Closing the stemming gap, token-natively": the gap is stemming; the two fixes;
   the recipe-ladder BarChart (norm -> word_tuple -> +freq expansion -> GroupCov vs word_en); honest
   tie framing. Deep bake-off (GroupCov vs span vs mintf, coverage exponent, local-IDF/Rocchio,
   weight<=candidate-precision law) goes in <details> or a part-2 pointer — main flow stays lean.
5. REVISE "Can we beat BM25? No": Round-2 naive 67-variant sweep overfit (no) — but the TARGETED
   token-native fixes (Rounds 3-5) reach parity (yes, to a tie). Distribution section stays as "why
   you can't blow PAST BM25 without learned weights = SPLADE".
6. Multilingual + latency: keep.
7. Limitations + Key Takeaways: rewrite to the new result.

## New assets needed

- Recipe-ladder BarChart with R5 numbers (norm/word_tuple+freq/GroupCov/word_en). Data on hand.
- Optional: @10/@100 grid table in <details>; bootstrap deltas.

## Still-open decisions

- Framing = "reaches/ties, nominally ahead, significantly beats plain token-BM25; not yet a
  significant win over word_en" — confirm (vs stronger "beats").
- Depth: headline recipe in main flow, deep saga in <details>/part-2 — confirm.
