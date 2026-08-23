import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "false");
    window.localStorage.setItem("openhands-telemetry-consent", "denied");
    window.localStorage.setItem("openhands-telemetry-first-use", "true");
    window.localStorage.setItem("openhands-onboarded", "1");
    window.localStorage.setItem(
      "openhands-backends",
      JSON.stringify([
        {
          id: "default-local",
          name: "EvoLoom",
          host: window.location.origin,
          apiKey: "evoloom-public-demo",
          kind: "local",
        },
      ]),
    );
  });
});

test("loads the public model catalog and switches language", async ({
  page,
}) => {
  await page.goto("/conversations");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "shows its work",
  );
  await expect(page.getByLabel("Model").locator("option")).toHaveCount(5);

  await page.getByRole("button", { name: "切换到中文" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "展示过程",
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "展示过程",
  );
});

test("shows honest benchmark evidence on the proof page", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "inspectable",
  );
  await expect(page.getByText("6 smoke integration tasks")).toBeVisible();
  await expect(
    page.getByText("not a statistically meaningful coding benchmark"),
  ).toBeVisible();
});

test("keeps the task composer usable at a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/conversations");
  const task = page.getByLabel("Describe a real task");
  await task.fill("Explain the repository architecture using code evidence.");
  await expect(
    page.getByRole("button", { name: "Run with EvoLoom" }),
  ).toBeEnabled();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
