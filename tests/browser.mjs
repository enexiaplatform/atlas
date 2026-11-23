import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import express from "express";
import { openDb } from "../server/db.mjs";
import { application } from "../server/app.mjs";
import { seed } from "../pilot/seed.mjs";
const db = await openDb();
let browser, server;
try {
  await db.migrate();
  const pilot = await seed(db);
  const app = application(db, { previewUser: pilot.admin.user });
  app.use(express.static(resolve("dist")));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const installed = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  browser = await chromium.launch({
    executablePath:
      process.env.ATLAS_CHROME ||
      (existsSync(installed) ? installed : undefined),
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
    }),
    issues = [];
  page.on("pageerror", (e) => issues.push(e.message));
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type()))
      issues.push(msg.text() + " " + msg.location().url);
  });
  await page.goto("http://127.0.0.1:" + server.address().port);
  assert.match(await page.title(), /Enexia Atlas/);
  const button = (name, exact = true) =>
    page.getByRole("button", { name, exact });
  const heading = (name) =>
    page.getByRole("heading", { name, exact: true }).waitFor();
  await button("Open synthetic Servicebio pilot").click();
  await heading("Knowledge overview");
  await button("Knowledge assets 12").waitFor();
  const out = process.env.ATLAS_SCREENSHOTS || "test-results";
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: resolve(out, "overview-desktop.png") });
  await button("New asset").click();
  await page.getByLabel("Title", { exact: true }).fill("Browser pilot record");
  await button("Create draft").click();
  await heading("Browser pilot record");
  await button("Edit asset").click();
  await page
    .getByLabel("Summary", { exact: true })
    .fill("A synthetic revision.");
  await button("Save revision").click();
  await page.getByText("A synthetic revision.", { exact: true }).waitFor();
  await button("Evidence & files").click();
  await page.getByLabel("source", { exact: true }).fill("scanner-brochure.txt");
  await page.getByLabel("claim", { exact: true }).fill("Synthetic claim");
  await page.getByLabel("Source passage").fill("Demonstration passage");
  await button("Link evidence").click();
  await page.getByText("Synthetic claim", { exact: true }).waitFor();
  await page
    .locator("input[type=file]")
    .setInputFiles("pilot/scanner-brochure.txt");
  await button("Upload file").click();
  await button("Preview").click();
  await page.getByText(/SYNTHETIC TRAINING BROCHURE/).waitFor();
  await button("History").click();
  await page.getByText(/^Version 4 ·/).waitFor();
  await button("Knowledge library").click();
  await page.getByLabel("Search knowledge").fill("Browser pilot record");
  await page.getByText("1 records · Page 1").waitFor();
  await button("Intelligence database").click();
  await button("Save view").click();
  await page.getByLabel("View name").fill("Pilot view");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save view" })
    .click();
  await page.getByLabel("Saved views").selectOption("Pilot view");
  await button("Knowledge graph").click();
  await button(/Western blot workflow/, false).click();
  await page.locator(".neighborhood").waitFor();
  await page.screenshot({ path: resolve(out, "graph-desktop.png") });
  await page
    .locator(".graphnodes")
    .getByRole("button", { name: /Transfer membrane/ })
    .click();
  await heading("Transfer membrane");
  await button("Administration").click();
  await page.getByLabel("Term", { exact: true }).fill("New research area");
  await button("Add term").click();
  await page.getByText("New research area", { exact: true }).waitFor();
  await button("Overview").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await heading("Knowledge overview");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: resolve(out, "overview-mobile.png") });
  await button("Open navigation").click();
  await button("Research workspace").click();
  await heading("Research workspace");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(issues, []);
  console.log(
    "PASS desktop and mobile E2E: authentication, create, edit, evidence, upload, preview, history, search, saved view, graph traversal, taxonomy and responsive navigation. Clean browser console.",
  );
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  await db.close();
}
