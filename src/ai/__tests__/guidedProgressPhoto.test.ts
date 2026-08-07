/**
 * DEMAND_020 — Guided Progress Photo Capture.
 * Primary surface: public/index.html. No paid providers / no tracking.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GUIDED_PROGRESS_PHOTO_CONTENT,
  getGuidedProgressPhotoContent,
} from "../guided-progress-photo/GuidedProgressPhotoContent";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("DEMAND_020 Guided Progress Photo Capture", () => {
  const html = read("public/index.html");
  const content = getGuidedProgressPhotoContent();

  it("1–2. Guide button exists with exact title text", () => {
    assert.match(html, /id="photoGuideOpen"/);
    assert.match(html, /How to take the perfect progress photo/);
    assert.equal(content.buttonLabel, "How to take the perfect progress photo");
    assert.match(html, /📷\s*How to take the perfect progress photo/);
  });

  it("3–5. Guide stays closed until user opens; closes via user action", () => {
    assert.match(html, /id="photoGuide"[\s\S]*?\bhidden\b/);
    assert.match(html, /initPhotoGuide|photoGuideOpen/);
    assert.match(html, /guide\.hidden\s*=\s*false/);
    assert.match(html, /guide\.hidden\s*=\s*true/);
    assert.match(html, /id="photoGuideClose"/);
    assert.match(html, /Got it/);
    assert.equal(content.closeLabel, "Got it");
  });

  it("6–8. One neutral inline SVG illustration; no external photo URL", () => {
    assert.match(html, /Neutral full-body silhouette|photo-guide-illu/);
    assert.match(html, /<svg[\s\S]*class="photo-guide-illu"/);
    const guideSlice = html.slice(
      html.indexOf('id="photoGuide"'),
      html.indexOf('id="onboard"')
    );
    assert.equal(/<img\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(guideSlice), false);
    assert.equal(/unsplash|pexels|imgur\.com/i.test(guideSlice), false);
  });

  it("9–14. Exactly five rules with required meanings", () => {
    assert.equal(content.rules.length, 5);
    assert.match(html, /id="photoGuideRules"/);
    const rulesBlock = html.match(/id="photoGuideRules"[^>]*>([\s\S]*?)<\/ol>/)?.[1] || "";
    const items = [...rulesBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
    assert.equal(items.length, 5);
    assert.match(items[0], /full body from head to feet/i);
    assert.match(items[1], /arms slightly away/i);
    assert.match(items[2], /camera straight/i);
    assert.match(items[3], /even light from the front/i);
    assert.match(items[4], /simple background/i);
  });

  it("15–17. Good and poor light examples; educational wording", () => {
    assert.match(html, /Good light/);
    assert.match(html, /Harder for the AI to interpret/);
    assert.equal(content.goodLightLabel, "Good light");
    assert.equal(content.poorLightLabel, "Harder for the AI to interpret");
    const guideSlice = html.slice(html.indexOf('id="photoGuide"'), html.indexOf('id="onboard"'));
    assert.equal(/\bBad photo\b|\bWrong photo\b|\bRejected\b|\bUnsafe\b/i.test(guideSlice), false);
  });

  it("18–23. No legal / adult / consent / provider / subscription / medical text in guide", () => {
    const guideSlice = html.slice(html.indexOf('id="photoGuide"'), html.indexOf('id="onboard"'));
    assert.equal(/terms of service|privacy notice|legal review/i.test(guideSlice), false);
    assert.equal(/at least 18|adult confirmation|I confirm that every person/i.test(guideSlice), false);
    assert.equal(/consentConfirmed|sensitive-data consent|I consent/i.test(guideSlice), false);
    assert.equal(/Replicate|provider safety|moderation policy/i.test(guideSlice), false);
    assert.equal(/subscription|refund|billing/i.test(guideSlice), false);
    assert.equal(/medical prediction|diagnos|treatment/i.test(guideSlice), false);
  });

  it("24–27. Guide does not trigger upload or block selection/generation", () => {
    assert.match(html, /id="file"\s+type="file"/);
    assert.match(html, /id="run"/);
    const openHandler = html.slice(
      html.indexOf("openBtn.addEventListener"),
      html.indexOf("openBtn.addEventListener") + 280
    );
    const closeHandler = html.slice(
      html.indexOf("closeBtn.addEventListener"),
      html.indexOf("closeBtn.addEventListener") + 280
    );
    assert.equal(/fileInput\.click|showOpenFilePicker|launchCamera/i.test(openHandler), false);
    assert.equal(/fileInput\.click|generate-future-you/i.test(closeHandler), false);
    assert.match(html, /fileInput\.addEventListener\("change"/);
  });

  it("28–31. No quality score / pose / age / body analysis", () => {
    const guideJs = html.slice(html.indexOf("initPhotoGuide"), html.indexOf("initPhotoGuide") + 1200);
    assert.equal(/qualityScore|poseDetection|estimateAge|bodyAnalysis|tensorflow|mediapipe/i.test(guideJs), false);
    assert.equal(GUIDED_PROGRESS_PHOTO_CONTENT.version, "1.0");
  });

  it("32–35. No guide tracking storage or analytics", () => {
    const guideJs = html.slice(html.indexOf("initPhotoGuide"), html.indexOf("initPhotoGuide") + 1200);
    assert.equal(/localStorage|sessionStorage|document\.cookie|indexedDB|gtag|analytics/i.test(guideJs), false);
  });

  it("36–42. Foundations and integrations unchanged by this domain module", () => {
    assert.equal(existsSync(join(root, "src/ai/guided-progress-photo/GuidedProgressPhotoContent.ts")), true);
    assert.equal(existsSync(join(root, "docs/CTO/20_GUIDED_PROGRESS_PHOTO_CAPTURE.md")), true);
    const prod = read("api/generate-future-you.js");
    assert.equal(/GuidedProgressPhoto|photoGuide/i.test(prod), false);
    const rep = read("lib/replicate.js");
    assert.equal(/GuidedProgressPhoto|photoGuide/i.test(rep), false);
    const trust = read("src/ai/account-trust/index.ts");
    assert.equal(/photoGuide|GuidedProgressPhoto/i.test(trust), false);
    const library = read("src/ai/account-trust/PersonalProgressLibraryTypes.ts");
    assert.equal(/photoGuide|GuidedProgressPhoto/i.test(library), false);
    const cr = read("public/ai-os-control-room.html");
    assert.equal(/photoGuideOpen|How to take the perfect progress photo/i.test(cr), false);
  });

  it("43–45. Active upload surface present; Escape closes; responsive styles", () => {
    assert.match(html, /id="panel-future"/);
    assert.match(html, /Escape/);
    assert.match(html, /photo-guide-light-row/);
    assert.match(html, /prefers-reduced-motion/);
    assert.match(html, /max-width:\s*440px|min\(100%,\s*440px\)/);
  });
});
