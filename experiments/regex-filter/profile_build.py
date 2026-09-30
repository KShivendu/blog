"""Where does the token index's build time actually go?

The post reported 6.3 s for the token route against 1.1 s for a dense trigram
index and called build time the axis where tokens lose. That comparison was
unfair: the trigram build is numpy-vectorised and the token build was a Python
loop, so the gap measured my implementation rather than the method.

Splitting it: tokenising is 1.61 s of the 6.3 s, and the boundary walk is 3.15 s.
HuggingFace `tokenizers` hands back per-token offsets, which removes the
decode-and-reconstruct step entirely, and the walk vectorises the same way the
trigram build already does. The boundary trigram sets come out identical, so
this is the same index built faster.

Run from the repo root:
  python3 experiments/regex-filter/profile_build.py
"""
import json, sys, time
sys.path.insert(0,"experiments/regex-filter")
from collections import defaultdict
from pyroaring import BitMap
import numpy as np
from tokenizers import Tokenizer

docs=json.load(open("experiments/regex-filter/data/docs_test.json"))[:8000]
nb=sum(len(d) for d in docs)
def t(): return time.perf_counter()
tk=Tokenizer.from_pretrained("gpt2")

print(f"{len(docs):,} docs, {nb/1e6:.1f} MB\n")

# encode_batch is the Rust fast path, and it hands back offsets
a=t(); encs=tk.encode_batch(docs); t_tok=t()-a
ntok=sum(len(e.ids) for e in encs)
print(f"1. HF encode_batch            {t_tok:6.2f}s   {ntok/1e6:.1f}M tokens, {ntok/t_tok/1e6:.1f}M tok/s")

a=t()
uni=defaultdict(BitMap)
for d,e in enumerate(encs):
    for i in set(e.ids): uni[i].add(d)
t_uni=t()-a
print(f"2. unigram postings           {t_uni:6.2f}s")

# offsets remove the decode+reconstruct entirely: boundary positions are given
a=t()
vtri=defaultdict(BitMap)
for d,e in enumerate(encs):
    b=docs[d].encode("utf-8","replace")
    L=len(b)
    for (_s,en) in e.offsets[:-1]:
        for k in (en-2,en-1):
            if 0<=k<=L-3:
                vtri[(b[k]<<16)|(b[k+1]<<8)|b[k+2]].add(d)
t_walk=t()-a
print(f"3. boundary walk from offsets {t_walk:6.2f}s   (no decode step at all)")

# and the same walk vectorised with numpy, the way the trigram build already is
a=t()
vtri2=defaultdict(BitMap)
for d,e in enumerate(encs):
    b=docs[d].encode("utf-8","replace")
    arr=np.frombuffer(b,dtype=np.uint8).astype(np.uint32)
    if len(arr)<3: continue
    code=(arr[:-2]<<16)|(arr[1:-1]<<8)|arr[2:]
    ends=np.array([o[1] for o in e.offsets[:-1]],dtype=np.int64)
    ks=np.unique(np.concatenate([ends-2,ends-1]))
    ks=ks[(ks>=0)&(ks<len(code))]
    for c in np.unique(code[ks]): vtri2[int(c)].add(d)
t_vec=t()-a
print(f"4. same walk, numpy           {t_vec:6.2f}s   {t_walk/max(t_vec,1e-9):.1f}x faster than the loop")
print(f"\n   sound? boundary trigram sets identical: {set(vtri)==set(vtri2)}")
print(f"\n   token route, HF + numpy    {t_tok+t_uni+t_vec:6.2f}s")
print(f"   dense trigram (numpy)      1.13s  measured earlier")
