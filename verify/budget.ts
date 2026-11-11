/**
 * Gate B standing budgets, measured on the main screen as a person first sees it:
 * one screen, at most about ten controls, no developer tooling in the product UI.
 * A row of buttons that act as one choice (camera angle, what to show, vital signs) counts as one control.
 */
import type {Page} from '@playwright/test';

export const BUDGET = {controls: 10};
/** Words that belong to the engine's debugger, not to a person's body. */
export const DEVELOPER_WORDS = /\b(residual|ledger|solver|compartment|export run|load run|receipt|debug|baseline ×|× baseline|mass balance)\b/i;

export type BudgetResult = {
  controls: {count: number; limit: number; names: string[]; pass: boolean};
  tabs: {count: number; pass: boolean};
  developerWords: {found: string[]; pass: boolean};
  scroll: {pass: boolean};
};

export async function measureBudget(page: Page): Promise<BudgetResult> {
  const {names, tabs, words, scrolls} = await page.evaluate((pattern) => {
    const visible = (e: Element) => {const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;};
    const label = (e: Element) => (e.getAttribute('aria-label') || (e as HTMLElement).innerText || e.getAttribute('title') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    const seen = new Set<Element>(), names: string[] = [];
    for (const e of document.querySelectorAll('button, select, input, textarea, [role="slider"], [role="tab"], a[href]')) {
      if (!visible(e)) continue;
      const group = e.closest('[role="group"], [role="radiogroup"], [role="toolbar"], [aria-label="Camera angle"], [aria-label="Vital signs"]');
      if (group) {if (!seen.has(group)) {seen.add(group); names.push(`${group.getAttribute('aria-label') ?? 'group'} (group)`);} continue;}
      names.push(label(e));
    }
    const text = document.body.innerText, re = new RegExp(pattern, 'gi');
    return {names, tabs: document.querySelectorAll('[role="tab"]').length, words: [...new Set(text.match(re) ?? [])], scrolls: document.documentElement.scrollHeight > innerHeight + 1};
  }, DEVELOPER_WORDS.source);
  return {
    controls: {count: names.length, limit: BUDGET.controls, names, pass: names.length <= BUDGET.controls},
    tabs: {count: tabs, pass: tabs === 0},
    developerWords: {found: words, pass: words.length === 0},
    scroll: {pass: !scrolls},
  };
}
