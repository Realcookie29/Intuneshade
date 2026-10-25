import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import { stripSensitive } from "../services/ai/sanitize";
import { REPORT_CSP_META } from "./reportInteractivity";

describe("csv", () => {
  it("neutralises formulas and quotes separators", () => {
    expect(csvCell('=HYPERLINK("https://evil","x")')).toBe(`"'=HYPERLINK(""https://evil"",""x"")"`);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("plain")).toBe("plain");
    expect(toCsv(["h"], [[null]])).toBe("h\r\n");
  });
});

describe("stripSensitive", () => {
  it("removes script bodies and secrets, keeps the rest", () => {
    const out = stripSensitive({
      displayName: "Script policy",
      scriptContent: "cGFzc3dvcmQ=",
      settings: [{ detectionScriptContent: "abc", name: "x" }, { wifi: { preSharedKey: "k", ssid: "corp" } }],
      emptySecret: "",
    });
    expect(out.displayName).toBe("Script policy");
    expect(out.scriptContent).toMatch(/removed/);
    expect(out.settings[0].detectionScriptContent).toMatch(/removed/);
    expect(out.settings[0].name).toBe("x");
    expect((out.settings[1] as { wifi: { preSharedKey: string; ssid: string } }).wifi.preSharedKey).toMatch(/removed/);
    expect(out.emptySecret).toBe("");
  });
});

describe("report CSP", () => {
  it("blocks every external load from downloaded reports", () => {
    expect(REPORT_CSP_META).toContain("default-src 'none'");
    expect(REPORT_CSP_META).not.toMatch(/https?:/);
  });
});
