# Build spec: Buy and Sell page pillar sections (Option B)

Nov 14, 2026 · @Mayank Singhal

## What to build

Replace the four equal cards under the hero on `buy.html` and `sell.html` with one full-width lead card and three cards beneath it, with a larger intro statement above and two calls to action below. The approved visual reference is Option B on the design canvas: [Buy page section redesign](https://claude.ai/artifact/Sd1nDRWLwge64xRouxBSxE).

Scope and rules:

- Change only the intro paragraph and the four-card block on each page. On the live site these are the intro paragraph and the pillar grid directly after the hero; find them in each file before editing.
- Keep every word of the existing body copy. Only the headings gain an accent span, and one Sell heading is shortened as listed below.
- Use the site's existing fonts (Montserrat, Cormorant Garamond italic) and colour variables. Add no new fonts, libraries or images.
- Put the CSS in the shared stylesheet that both pages load, and the reveal script in the shared navigation script. No inline `<style>` blocks per page.
- Bump the cache version on the stylesheet and script links in both pages.
- Do not touch the hero, the search form, the valuation wizard, the listings grids or the footer.

## Buy page markup

Use this structure exactly. The Sell page uses the same structure with the content from the next section.

```html
<section class="pillars" aria-labelledby="pillars-buy-title">
  <div class="pillars__intro" data-reveal>
    <span class="pillars__eyebrow" id="pillars-buy-title">How I represent buyers</span>
    <p class="pillars__statement">Buying a home in the Bay Area demands preparation, fast access, and strategic negotiation. I guide you with <em class="accent">data-sharp execution and coach’s discipline</em> through every milestone.</p>
  </div>

  <article class="pillar pillar--lead" data-reveal>
    <div class="pillar__head">
      <span class="pillar__label">01 · Strategy</span>
      <h2 class="pillar__title">Offers Structured to <em class="accent">Win</em></h2>
    </div>
    <p class="pillar__body">In a competitive Tri-Valley or East Bay market, the strongest offer is not always the highest number. I structure terms around what the seller actually needs, and I negotiate to protect your interests from the first showing through closing.</p>
  </article>

  <div class="pillars__grid">
    <article class="pillar" data-reveal>
      <span class="pillar__label">02 · Relocation</span>
      <h3 class="pillar__title">Relocating to the <em class="accent">East Bay</em></h3>
      <p class="pillar__body">Moving from across the country — or on a tight Sports &amp; Entertainment schedule — means making big decisions from a distance. I help you compare neighborhoods, schools, and commutes, preview homes on your behalf, and keep every step NDA-friendly.</p>
    </article>
    <article class="pillar" data-reveal>
      <span class="pillar__label">03 · Diligence</span>
      <h3 class="pillar__title">Diligence, <em class="accent">Handled</em></h3>
      <p class="pillar__body">From inspections scheduled on short notice to contingent sales with moving parts on both sides, I coordinate the specialists and translate what matters so every decision is an informed one.</p>
    </article>
    <article class="pillar" data-reveal>
      <span class="pillar__label">04 · Approach</span>
      <h3 class="pillar__title">Coach’s Discipline, <em class="accent">Family First</em></h3>
      <p class="pillar__body">Raised in Pleasanton and shaped by years coaching at De La Salle and Ohlone College, I bring preparation, calm communication, and follow-through to every family’s home search.</p>
    </article>
  </div>

  <div class="pillars__cta" data-reveal>
    <a class="sw-btn sw-btn--primary" href="connect.html">Start a private conversation</a>
    <a class="pillars__link" href="properties.html">See recent closings →</a>
  </div>
</section>
```

The intro statement shortens the current paragraph. The removed middle sentence ("From competitive multiple-offer scenarios… relocation coordination") is covered by cards 01 and 02; keep it only if the owner asks.

## Sell page content

Same markup, with `id="pillars-sell-title"`, these values, and body copy unchanged from the live page.

| Slot | Text |
| --- | --- |
| Eyebrow | How I represent sellers |
| Statement | Selling a home is personal. I build each sale around \<em class="accent">a clear strategy\</em>: pricing grounded in current Tri-Valley and East Bay comparables, Compass Concierge presentation that earns showings, and steady communication so you always know where things stand. |
| 01 label and title (lead card) | 01 · Pricing — Pricing Grounded in \<em class="accent">Real Comparables\</em> |
| 02 label and title | 02 · Preparation — Ready for Market, Even When Life Is \<em class="accent">Busy\</em> |
| 03 label and title | 03 · Timing — Selling and Buying at the \<em class="accent">Same Time\</em> |
| 04 label and title | 04 · Reach — Compass Reach & \<em class="accent">Private Exclusives\</em> |
| Primary button | Request a pricing walkthrough → `connect.html` |
| Text link | See recent closings → `properties.html` |

The 04 heading is shortened from "The Reach of Compass & Private Exclusives" so it fits on two lines like the others. The `<em class="accent">` tags in the table are markup to write, not text to display.

## CSS

Written mobile first: one column by default, the grid at 861px and up. Use the site's existing variables where they exist (`--sw-accent` for gold, `--sw-ink`, `--sw-border`, `--sw-font-display`); the fallbacks below are the current values.

```css
.pillars { max-width: 1160px; margin: 0 auto; padding: 56px 20px; display: flex; flex-direction: column; gap: 40px; }
.pillars .accent { font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; font-weight: 400; font-size: 1.14em; color: var(--sw-accent, #D8A55A); }

.pillars__intro { display: flex; flex-direction: column; gap: 16px; max-width: 900px; }
.pillars__eyebrow, .pillar__label { font-size: 0.69rem; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--sw-accent, #D8A55A); }
.pillars__statement { margin: 0; font-size: clamp(1.3rem, 2.3vw, 1.9rem); font-weight: 300; line-height: 1.45; letter-spacing: -0.01em; color: var(--sw-ink, #F3EEE6); }

.pillar { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px; padding: 28px; background: #141A23; border: 1px solid var(--sw-border, rgba(243,238,230,0.14)); border-radius: 14px; transition: transform 0.3s ease, border-color 0.3s ease; }
.pillar::before { content: ""; position: absolute; left: 0; top: 0; height: 2px; width: 0; background: var(--sw-accent, #D8A55A); transition: width 0.35s ease; }
.pillar__title { margin: 0; font-family: var(--sw-font-display, Montserrat, sans-serif); font-size: 1.6rem; font-weight: 300; line-height: 1.2; letter-spacing: -0.01em; color: var(--sw-ink, #F3EEE6); }
.pillar__body { margin: 0; font-size: 0.97rem; line-height: 1.7; color: rgba(243, 238, 230, 0.76); }

.pillar--lead .pillar__head { display: flex; flex-direction: column; gap: 12px; }
.pillar--lead .pillar__title { font-size: clamp(1.9rem, 3.2vw, 2.75rem); line-height: 1.12; letter-spacing: -0.015em; }
.pillar--lead .pillar__body { font-size: 1.05rem; color: rgba(243, 238, 230, 0.8); }

.pillars__grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
.pillars__cta { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: center; }
.pillars__cta .sw-btn { min-height: 48px; justify-content: center; }
.pillars__link { min-height: 48px; display: inline-flex; align-items: center; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; text-decoration: none; color: var(--sw-accent, #D8A55A); }
.pillars__link:hover { color: #F5F2EC; }

@media (hover: hover) {
  .pillar:hover { transform: translateY(-3px); border-color: rgba(216, 165, 90, 0.55); }
  .pillar:hover::before { width: 100%; }
}
.pillar:focus-within { border-color: rgba(216, 165, 90, 0.55); }

@media (min-width: 861px) {
  .pillars { padding: 96px 48px; gap: 56px; }
  .pillar { padding: 32px; }
  .pillar--lead { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 48px; align-items: center; padding: 44px 48px; }
  .pillars__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
  .pillars__cta { display: flex; flex-wrap: wrap; gap: 16px; }
}

/* Scroll reveal: hidden only when the script has confirmed it is running */
.js-reveal [data-reveal] { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; transition-delay: var(--reveal-delay, 0ms); }
.js-reveal [data-reveal].is-in { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  .js-reveal [data-reveal] { opacity: 1; transform: none; transition: none; }
  .pillar, .pillar::before { transition: none; }
  .pillar:hover { transform: none; }
}
```

Remove the old pillar card rules only after confirming no other page uses them.

## Scroll reveal script

Add once to the shared navigation script. Content stays visible if the script fails, because the hiding rule depends on the `js-reveal` class this code adds.

```js
(function () {
  var items = document.querySelectorAll('[data-reveal]');
  if (!items.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.documentElement.classList.add('js-reveal');

  var observer = new IntersectionObserver(function (entries) {
    var shown = 0;
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.style.setProperty('--reveal-delay', (shown * 80) + 'ms');
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
      shown += 1;
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach(function (el) { observer.observe(el); });
})();
```

Timing: 500ms fade and 16px rise per item, 80ms apart for items that enter together. Each item animates once.

## Acceptance checks

- [ ] Both pages show the eyebrow, statement, one lead card, three cards and two actions, in that order, directly after the hero.
- [ ] Body copy in all eight cards matches the live pages word for word.
- [ ] At 1366px wide: lead card is two columns; the three cards sit in one row with equal heights; no heading runs past two lines.
- [ ] At 375px wide: everything is one column, no sideways scroll, both actions are full width and at least 48px tall.
- [ ] Hover on a desktop pointer lifts the card 3px and draws the gold line in 350ms; nothing sticks in the hover state on touch screens.
- [ ] Items fade in once as they enter the viewport, 80ms apart.
- [ ] With reduced motion set, or with JavaScript off, all content is visible immediately and nothing animates.
- [ ] Heading order is valid: the lead card is an `h2`, the three cards are `h3`, and the page still has exactly one `h1`.
- [ ] Body text contrast is at least 4.5:1 against the card background.
- [ ] Nothing else on either page moved: hero, search form, valuation wizard, listings and footer look the same as before.

