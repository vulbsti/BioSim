import { test, expect } from "@playwright/test";
test.use({ reducedMotion: "reduce" });
// The whole window is a 3D canvas; under software rendering one frame can hold the page for seconds.
test.beforeEach(() => test.setTimeout(240000));

const clock = (page: import("@playwright/test").Page) => page.getByLabel("Elapsed simulation time", { exact: true });

test("one screen: the body fills the window and only plain controls float over it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const box = (await page.locator(".physical-stage").boundingBox())!,
    size = page.viewportSize()!;
  expect(box.width).toBeGreaterThan(size.width * 0.98);
  expect(box.height).toBeGreaterThan(size.height * 0.98);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  // The engine's bookkeeping panels and the separate labs are gone.
  await expect(page.getByRole("tab")).toHaveCount(0);
  for (const name of ["Transport", "Event ledger", "Brain vessels", "Fork a comparison", "Export run", "Open molecular lab"])
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/residual/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Try something" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("eating, skipping ahead and the chart are connected to the body", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Watch blood sugar" }).click();
  await expect(page.locator(".organ-card h3")).toHaveText("Liver");
  const sugar = async () => Number((await page.getByRole("button", { name: "Watch blood sugar" }).textContent())!.match(/(\d+)/)![1]);
  const fasting = await sugar();
  await page.getByRole("button", { name: "Eat it", exact: true }).click();
  await page.getByRole("button", { name: "Advance one hour" }).click();
  await expect(clock(page)).toHaveText("01:00:00");
  await expect.poll(sugar).toBeGreaterThan(fasting + 5);
  await page.getByRole("button", { name: "Over time" }).click();
  await expect(page.locator(".trace-svg path").last()).toHaveAttribute("d", /L/);
  await page.getByLabel("Look back in simulated time").fill("0");
  await expect(page.getByRole("button", { name: "Back to now" })).toBeVisible();
  await page.getByRole("button", { name: "Back to now" }).click();
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(clock(page)).toHaveText("00:00:00");
});

test("a situation plays by itself, and exercise speeds the heart", async ({ page }) => {
  await page.goto("/");
  const heart = async () => Number((await page.getByRole("button", { name: "Watch the heart and circulation" }).textContent())!.match(/(\d+)/)![1]);
  const resting = await heart();
  await page.getByLabel("Exercise", { exact: true }).fill("0.6");
  // The slider sends its value once it has settled for a moment.
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Advance five minutes" }).click();
  await expect.poll(heart).toBeGreaterThan(resting + 20);
  await page.getByRole("button", { name: "After a meal" }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(clock(page)).not.toHaveText("00:00:00");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("about explains what this is in plain words", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "About this simulation" }).click();
  await expect(page.getByRole("dialog")).toContainText("not a diagnosis");
  await page.getByRole("button", { name: "Close about" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
