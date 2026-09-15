# My Blog Writing Style Guide

Written by me, about me, in my own voice (Claude, this is your homework, let's see how you did xD).

Synthesized from `token-search.mdx`, `token-storage.mdx`, `if-splade.mdx`, `exa-napkin-math.mdx`, and the actual edit history of token-storage.mdx, since diffing what I cut is a way stronger signal than reading one finished post.

---

## Correctness comes first, above brevity and above every other rule here

Getting the claim exactly right matters more than any style rule below. A tight sentence that is slightly wrong is worse than a clunky one that is exact. Every number, scope, and mechanism in my posts is something I can be held to, so I care about this more than anything else. This bites hardest when pruning for brevity: cutting a word can flip a true statement into a false one.

Real mistakes to learn from (Claude, these were yours, made while editing `stemming-expansion.mdx`):

- **Scope-limiting qualifiers are load-bearing. Don't cut them for brevity.** "Porter merges race/races/racing and misses **anything the rules don't cover**" got pruned to "misses **everything else**." That's false. Porter catches every suffix-regular family, it does not miss "everything else." The qualifier was the correct scope, and dropping it broke the claim. I flagged it: "Please value correctness more than anything else."
- **Never round two different numbers into "the same."** I wrote "stemming lifts p25 by +0.03, the same as the median." The median actually moved +0.039, p25 +0.034. Close, but not "the same." Say both numbers, or "close to," never collapse distinct measurements into an equality that isn't there.
- **Don't assert a confident mechanism you haven't traced in the data.** I wrote that query-side expansion wins the tail because "attestation variants rescue rare words." Tracing the actual queries showed the opposite: the gold doc is matched by the exact query word, and stemming dilutes that word's own IDF to the family's. A plausible-sounding mechanism is a guess until the rows confirm it, so verify before writing it as fact.

How to apply: after any brevity edit, re-read the shortened sentence on its own and ask "is this still exactly true?" If a cut changed the scope, a number, or a causal claim, restore the precise version even if it costs a few words. When I flag a correctness error, fix it, then audit the rest of the same edit pass for the same class of mistake and report what I find.

**Finish every example you start.** The whole point of an example is to let the reader look into the data and build intuition, so a half-shown one is worse than none. If I say "`high` and `higher` get different stems," show them: "`high` stems to `high` but `higher` stems to `higher`." Never name a transformation, mechanism, or comparison and leave the actual values out. Concrete, complete, verified.

---

## Overall Structure

- Hook first line. Never "In this post, I will..."
- Second paragraph is always the TL;DR pointer: `> Looking for TL;DR? Check [key takeaways](#key-takeaways)`
- H2 for sections, H3 for subsections
- Ends with `## Key Takeaways`, no new info in there, just the compressed version of what I already said
- Sometimes `## Acknowledgements`, `## Citation` for the research-flavored posts

Flow is: motivate the question, explain the mechanism, show the result, draw the implication. Charts and tables come after I've explained what they mean, never before, a chart with no context is just noise.

**The content is deeply technical, so making sure people actually get it matters more than sounding smart.** If a paragraph makes someone re-read it to parse what I meant, I've failed, doesn't matter how nice the sentence sounds. That's the whole reason I default to bullets and short paragraphs, not because I like bullets, because a bulleted breakdown is something you can scan and check claim by claim, and every claim here is backed by a real number, so people should be able to verify it fast.

**Chart, then bullets, every single time.** Every `<BarChart>` gets a short lead-in right after it ("Observations:", "Three things in that chart matter:") and then a list. Never a paragraph. Each bullet is one claim, what's true and why, together, not split across two sentences. The chart shows the shape, the bullets tell you what to conclude, I don't make the reader do that math themselves.

## Tone

- **First person, with a deliberate I/we split.** As the practical sole author, "I" for what I actually did is honest and direct, not narcissistic: "I ran this," "I built that," "I tested it," plus "my BM25," "my index" for my own setup. I use "we" for the procedural walkthrough and shared looking, where the reader follows along: "for each word, we look at the neighbours," "we have to make two choices," "run both sides and we can see the tail move." Rule of thumb: "I" for my concrete actions and artifacts, "we" for how-it-works and let's-look-together.
- Don't default to all-"we" or all-"I". All-"we" on a solo blog reads corporate (royal-we) and faintly implies co-authors who aren't there, and all-"I" makes every sentence open with I. I tried converting a whole post to "we" once and reverted, the split is the honest middle. Third person ("this reveals," "one might conclude") is still the wrong voice almost everywhere, if it shows up a section needs a pass.
- Casual and precise at the same time. "I benchmarked", "I ran", "I realised"
- I commit to a number even when I'm not 100% sure, I don't hide behind vague ranges when I have a concrete one
- I say what the data can't prove too ("with n=5 pairs, too small to confirm")
- "Note that..." whenever something non-obvious needs flagging mid-section
- I'll admit when a result surprised me
- I ask the question before I answer it: "How does it perform on BM25? And is it possible it can surpass existing solutions in some way?"
- When I ask something of a named lab/company directly, I just ask it plainly, "I request Anthropic and Google to open-source their tokenizers." I tried softening this once to "I'd like to see..." and it read more arrogant, not less, since now it's about what _I_ want instead of the actual ask. Lesson learned: soften the surrounding context if you have to, not the ask itself.

## My grammar isn't broken, don't "fix" it

- I drop articles sometimes: "I have two request from the AI community/labs," "as an user of," "in future" not "in the future". That's just how I write, leave it.
- "never learnt" not "never learned"
- I comma-splice instead of using semicolons when I want a quick trailing thought: "ANS on top gets you to 3.37x, but that's a bonus, the tokens are the real win."
- Tight contrast: "The hard part isn't the math, it's the ecosystem."
- Occasional :D or :) when something's fun
- I stay first person throughout, "I realised", "this napkin math is what gave me the motivation." The moment a section drifts into third-person-analyst voice, that's usually the tell it needs a rewrite pass.
- If a small concrete example is fun, I keep it even if it's technically redundant with the paragraph next to it. Cut the " cat" 4-bytes-vs-1-token example once for being duplicative, put it right back the same day. Some things earn their place just by being fun.

## Em dashes and semicolons: banned, and how to actually remove them

I hate em dashes (—) and semicolons (;) in my posts. Don't use them, and don't just swap `—` for a comma and call it done, that usually leaves a limp sentence. Rewrite into natural English. (En-dash ranges like `50k–200k`, `68–112×`, joint names like Church–Gale, and `TL;DR` are fine, those aren't what I mean.)

The moves that worked, roughly in order of how often they're right:

- **Bullet label `**Label** — text`becomes`**Label.** text`.** Period after the bold label, not a colon. This covers most of my observation bullets: `**Naive BPE breaks on the tail.** The ten-point mean drop undersells it...`
- **A period, two sentences, when the dash joined two full clauses.** "...not just rank 10 — normalized BPE tracks..." becomes "...not just rank 10. Normalized BPE tracks..."
- **A comma-splice for a quick trailing clause.** "...vs word's 20% — half again as many queries returning nothing" becomes "...vs word's 20%, half again as many queries returning nothing."
- **", and", ", so", or ", since" when the dash was a connector.** "Toggle the metric — the naive break widens..." becomes "Toggle the metric, and the naive break widens..." "...edge over the stemmer — a full-BEIR run is needed" becomes "...over the stemmer, so a full-BEIR run is needed." A causal dash takes ", since": "noisy — they collide across unrelated words" becomes "noisy, since they collide across unrelated words."
- **Parentheses when a dash-pair wrapped an aside.** "costs 2 posting reads — two documents contain it — and 13,799" becomes "costs 2 posting reads (two documents contain it) and 13,799." A dash-pair listing options folds the same way: "a sparse-vector index — [Qdrant], or Lucene's terms-as-bytes — already keys" becomes "A sparse-vector index (like [Qdrant], or Lucene's terms-as-bytes) already keys."
- **A colon only when it introduces a real list or label**, never for drama. "match a plain word analyzer — encode each lowercased word..." becomes "match a plain word analyzer: encode each lowercased word..."
- **When the wrapped aside has its own comma, don't swap the dash-pair for two commas**, you'd get a comma-salad that loses the grouping. Use parentheses, or rewrite the inner comma away. "(−0.004, CI [...]) — a tie, not proven equal — and −0.02 behind" became "(−0.004, CI [...]), a tie but not proven equal, and −0.02 behind" (inner comma turned into "but"). "Stack both — plus a stopword list, load-bearing once un-fragmented — and the gap closes" became "Stack both, plus a stopword list that turns load-bearing once un-fragmented, and the gap closes" (inner appositive turned into a "that" clause).

Semicolons go the same way, comma-splice or period. "`storage` is one token; `tokenization` is two; the whole vocabulary..." becomes "...is one token, `tokenization` is two, and the whole vocabulary..." "judged passages only; I used an exact-float BM25" becomes "judged passages only. I used an exact-float BM25."

**The one that bites: a dash sometimes hides a missing verb.** Swap the punctuation and the sentence won't parse. "...the stopword list I replaced with a rarity prior — but the expansion..." leaves "and the stopword list I replaced with a rarity prior." dangling if you just drop in a comma. I had to add words: "...and so is the stopword list, now a rarity prior. But the expansion..." When the naive swap reads wrong, the dash was doing grammatical work, so add the verb.

## How I explain technical stuff

- Mechanism first, numbers after. You should know why a result makes sense before you see it.
- Math stays inline as plain prose: `8 / (4096/256) = 512 GB`, not LaTeX, not a code block unless it's actual code
- Bold the number that matters: **13×**, **0.0093 NDCG@10**
- One cause, one sentence: "The 13× latency gap comes _entirely_ from eliminating the query encoder call."
- I address the obvious "but what about X" before someone asks it in the comments
- I show the failed attempt before the fix. "Here's the first thing I tried. It fails in an instructive way, the fix falls right out of it." That's more honest than pretending I got it right first try.
- `<details>` is for side quests, not a dumping ground. I like running side experiments and sharing them, but they don't belong in the main flow, they'd dilute the actual argument. So they get fenced off instead of cut entirely. If something's fun but tangential: collapse it, don't kill it.
- Everything left OUTSIDE a `<details>` is the core argument, and it earns the full treatment: real data, color, interactivity, an actual experiment behind it, clean bullets. If a core point is just sitting there as a paragraph with nothing backing it, that's a gap I need to fill, not a style choice.
- `<details>` sections are also where I proofread least, so that's exactly where old AI-draft leftovers hide longest if I'm not careful:
  - Bold-label-then-colon on every bullet ("**The actual argument:** ..."), cut the scaffold, just say the sentence
  - Cute meta-labels like "Digging deeper:" or "Side note:". Cut them, or turn one into an actual question instead
  - "X. The reason: Y" repeated across bullets reads like a textbook talking to itself, fold the reason into the same sentence
  - A wrap-up sentence at the end that just restates the point in fancier words, cut it, the point already landed
  - Bullets that are all suspiciously the same shape (topic, nuance, catch, conclusion). Mine are never that tidy, and neither should the AI-assisted ones be
  - Hedge words I don't actually use: "genuinely," "clearly," "worth noting," "a real but modest." If I see these, someone else wrote that sentence.
  - **Banned phrase: "closes the loop"** (and "close/closing the loop"). I don't want to see this again, in any post. Say what actually closes, plainly, e.g. "this only works end to end if..." instead of "this only closes the loop if...".
  - **Banned metaphors: "earn its keep" / "earns its keep", and the knob metaphor "turn the knobs" / "turned the knobs" / "a knob you can turn" / "X becomes a knob".** Forced and jargon-y, they make me stop and decode. Say it plainly instead: "which step actually matters" (not "earns its keep"), "test each step one at a time" or "add one step at a time" (not "turn the knobs"), "we can do even better by learning the expansions from data" (not "that family becomes a knob you can turn"). A literal tunable parameter can still be called a knob in passing ("the k1 knob"), it's the forced metaphor on a whole idea I hate.

## Mobile matters, I actually design for it

A lot of people find my posts from social media on their phone, mid-scroll. The goal is to spark enough interest there that they either keep reading or come back on desktop later. So:

- Focus mode (fewer categories, less clutter) is the _default_ on mobile, not a fallback. Desktop still opens on "All."
- Fonts go up on mobile even as the chart shrinks, small text on a small screen doesn't work no matter how you scale it
- Titles reflow above the chart instead of getting crammed into the SVG at unreadable size
- Basically: every interactive thing gets its own "how does this feel on a phone, half-attentive, from a tweet" check, not just a generic responsive breakpoint

## Charts and tables

- `<BarChart>` is the default now, not Plotly. Toggleable datasets/views, horizontal or vertical.
- Color means something: muted grey for the baseline/faded stuff, one saturated color per thing I actually want you looking at
- Custom widgets when the idea needs one (`<SpladeVsIF />`, `<TokenCompressionAnimated />`)
- One "remember this number" cell per table, max, otherwise nothing sticks
- Secondary tables that just confirm the main result on a different dataset go in a `<details>`

## Headers

- Emoji H2s for the napkin-math/infra posts (`## 📦 Content Storage`)
- Plain H2s, no emoji, for the ML research posts
- Simple rule: back-of-envelope gets an emoji, research doesn't

## Links

- First mention of anything non-obvious gets a link
- Model names link straight to HuggingFace
- Paper claims link to the paper
- Never "click here", always say what's actually there
- I use text-fragment highlighting (`#:~:text=...`) so a link jumps straight to the exact sentence I'm citing, not just the page
- Glossary terms use `#[phrase](explanation)`, it's not real link syntax so it just degrades to plain text anywhere else, and turns into a hover tooltip here
- **Narrative claims ("I realised," "I found," "I noticed") link back to the specific section/sentence in the same post that actually backs them up**, not just left as an assertion. Use a same-page anchor + text-fragment highlight (`#section-id:~:text=...`) pointing at the exact supporting sentence, same technique as external citations, just aimed inward. E.g. "I [realised](#step-1-generate-token-ids:~:text=...)" jumps straight to the napkin math that motivated the claim.
- **When the glossary/reference section explains one method with a "see how it works above" pointer, every sibling method in that same list needs the same pointer, not just some of them.** Caught this as a real inconsistency: `+ANS`'s glossary entry linked back to its explanation section, `+freq`'s didn't, even though both get equally full explanations earlier in the post. Check every item in a parallel list has the same kind of cross-reference, not just the ones that happened to get it on the first pass.
- Do an actual link audit pass on a finished post looking for: (a) non-obvious terms already used earlier in my own writing (check the style guide's own examples, e.g. "binary quantization" and "scalar/int8 quantization" are specific enough sub-concepts to need their own link even if the generic "quantization" term got linked once already higher up), (b) narrative claims with no pointer to their evidence, (c) asymmetric glossary/reference entries where a sibling item is missing the cross-reference its neighbors have.

## Key Takeaways

- 3-6 bullets, and I keep trimming these down over edits, not adding to them
- A bold label is fine here, same form as my observation bullets: `**Label.** text`, period after the label, never a colon. What matters is that the label reads like natural English a person would say, not a scaffold word glued on to look structured.
- Nothing new, just the compressed version of the post
- First bullet is the actual result, rest are implications/caveats

## What I don't do

- Long paragraphs for technical stuff (the hook up top is the one exception)
- An intro that just restates the title
- A conclusion that just re-lists the headings
- Hedging without a number ("results suggest it might..."). Either commit or say exactly why you can't
- Jargon with no link or quick definition
- A table before you know what it's even measuring
