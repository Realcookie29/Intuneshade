import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "anthropic" | "openai" | "gemini" | "azure-openai";

interface AiRequest {
  provider?: Provider;
  azureEndpoint?: string;
  azureDeployment?: string;
  mode: "analyze" | "script" | "resolve" | "compliance";
  policies?: Array<{ name: string; type: string; json: unknown }>;
  description?: string;
  scriptType?: "powershell" | "graph";
  conflict?: { description: string; policies: string[] };
  tenantSummary?: TenantSummary;
}

interface PolicyTypeSummary {
  type: string;
  label: string;
  count: number;
  unassignedCount: number;
  allUsersCount: number;
  allDevicesCount: number;
  groupAssignedCount: number;
  exclusionCount: number;
}

interface TenantSummary {
  scannedAt: string;
  totalPolicies: number;
  totalGroups: number;
  byType: PolicyTypeSummary[];
  unassignedPolicies: Array<{ type: string; name: string }>;
}

interface RiskItem {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
}

interface RecommendationItem {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface AnalyzeResponse {
  summary: string;
  risks: RiskItem[];
  recommendations: RecommendationItem[];
}

interface ScriptResponse {
  script: string;
  explanation: string;
  language: "powershell" | "graph";
}

interface ResolveResponse {
  resolution: string;
  steps: string[];
}

interface ComplianceSection { title: string; content: string; }
interface ComplianceActionItem { priority: "high" | "medium" | "low"; text: string; }
interface ComplianceResponse {
  riskLevel: "low" | "medium" | "high" | "critical";
  executiveSummary: string;
  sections: ComplianceSection[];
  actionItems: ComplianceActionItem[];
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function stripMarkdownJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

const ANALYZE_SYSTEM = `You are a Microsoft Intune and Microsoft 365 security expert.
Analyze the provided Intune policy or policies and return a JSON object with exactly this structure:
{
  "summary": "2-3 sentence plain English description of what this policy does and who it affects",
  "risks": [
    { "severity": "critical|warning|info", "title": "short title", "description": "detailed explanation" }
  ],
  "recommendations": [
    { "title": "short title", "description": "actionable recommendation", "priority": "high|medium|low" }
  ]
}
Focus on: security gaps, overly permissive settings, missing configurations, compliance risks, and best practice deviations.
Return ONLY valid JSON — no markdown, no explanation outside the JSON.`;

const SCRIPT_SYSTEM = `You are a Microsoft Intune expert who writes clean, production-ready scripts.
When generating PowerShell: use the Microsoft.Graph PowerShell module, include Connect-MgGraph, add error handling with try/catch, and add comments.
When generating Graph API: use curl/HTTP format with full URLs, headers, and request bodies.
Return a JSON object:
{
  "script": "the complete script",
  "explanation": "2-3 sentences explaining what the script does and any prerequisites",
  "language": "powershell|graph"
}
Return ONLY valid JSON.`;

const RESOLVE_SYSTEM = `You are a Microsoft Intune expert. A conflict has been detected between Intune policies.
Analyze the conflict and provide a clear resolution. Return a JSON object:
{
  "resolution": "2-3 sentence explanation of the best resolution approach",
  "steps": ["step 1", "step 2", "step 3"]
}
Return ONLY valid JSON.`;

const COMPLIANCE_SYSTEM = `You are a senior Microsoft Intune and endpoint security auditor.
You will receive a structured JSON summary of a Microsoft Intune tenant's policy landscape.
Write a professional compliance posture report. Return a JSON object with exactly this structure:
{
  "riskLevel": "low|medium|high|critical",
  "executiveSummary": "3-4 sentences for a non-technical executive audience summarizing the overall posture",
  "sections": [
    { "title": "Section title", "content": "Detailed analysis paragraph(s)" }
  ],
  "actionItems": [
    { "priority": "high|medium|low", "text": "Specific, actionable remediation step" }
  ]
}
Include sections covering: Assignment Coverage, Compliance & Security Policies, Script & Remediation Coverage, Risk Observations, and Recommendations.
riskLevel is determined by: unassigned policy ratio, absence of compliance/security policies, and breadth of All Users/All Devices targeting.
Action items should be specific and prioritized. Return ONLY valid JSON.`;

// ─── Provider abstraction ─────────────────────────────────────────────────────

async function callAI(
  provider: Provider,
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number,
  azureEndpoint?: string,
  azureDeployment?: string,
): Promise<string> {
  if (provider === "azure-openai") {
    if (!azureEndpoint || !azureDeployment) {
      throw new Error("Azure OpenAI requires azureEndpoint and azureDeployment");
    }
    // Restrict the endpoint to genuine Azure OpenAI hosts. Without this, a caller
    // could point the request (and the API key) at an arbitrary URL (SSRF).
    if (!/^https:\/\/[a-z0-9-]+\.openai\.azure\.com\/?$/i.test(azureEndpoint)) {
      throw new Error("Invalid Azure OpenAI endpoint. Expected https://<name>.openai.azure.com");
    }
    const client = new OpenAI({
      apiKey,
      baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
      defaultQuery: { "api-version": "2024-08-01-preview" },
      defaultHeaders: { "api-key": apiKey },
    });
    const res = await client.chat.completions.create({
      model: azureDeployment,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (provider === "openai") {
    const client = new OpenAI({ apiKey });
    const res = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (provider === "gemini") {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: "gemini-1.5-pro",
      systemInstruction: system,
    });
    const result = await model.generateContent(user);
    return result.response.text();
  }

  // Default: Anthropic
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return message.content[0].type === "text" ? message.content[0].text : "";
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function claudeHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
  };

  if (req.method === "OPTIONS") {
    return { status: 204, headers };
  }

  // Require a caller-supplied key. There is deliberately no server-side fallback
  // key: this endpoint is anonymous, so a shared key could be abused by anyone.
  const apiKey = req.headers.get("X-Api-Key");
  if (!apiKey) {
    return {
      status: 401,
      headers,
      jsonBody: { error: "No API key provided. Configure your AI provider key in the toolbar." },
    };
  }

  let body: AiRequest;
  try {
    body = (await req.json()) as AiRequest;
  } catch {
    return { status: 400, headers, jsonBody: { error: "Invalid JSON body" } };
  }

  const provider: Provider = body.provider ?? "anthropic";
  const az = { endpoint: body.azureEndpoint, deployment: body.azureDeployment };

  try {
    // ── analyze ────────────────────────────────────────────────────────────────
    if (body.mode === "analyze") {
      if (!body.policies?.length) {
        return { status: 400, headers, jsonBody: { error: "policies array is required" } };
      }
      const userContent = body.policies
        .map((p) => `Policy: ${p.name} (${p.type})\n${JSON.stringify(p.json, null, 2)}`)
        .join("\n\n---\n\n");

      const raw = await callAI(provider, apiKey, ANALYZE_SYSTEM,
        `Analyze these Intune policies:\n\n${userContent}`, 4096, az.endpoint, az.deployment);
      const result: AnalyzeResponse = JSON.parse(stripMarkdownJson(raw));
      return { status: 200, headers, jsonBody: result };
    }

    // ── script ─────────────────────────────────────────────────────────────────
    if (body.mode === "script") {
      if (!body.description) {
        return { status: 400, headers, jsonBody: { error: "description is required" } };
      }
      const raw = await callAI(provider, apiKey, SCRIPT_SYSTEM,
        `Generate a ${body.scriptType ?? "powershell"} script to: ${body.description}`, 2000, az.endpoint, az.deployment);
      const result: ScriptResponse = JSON.parse(stripMarkdownJson(raw));
      return { status: 200, headers, jsonBody: result };
    }

    // ── resolve ────────────────────────────────────────────────────────────────
    if (body.mode === "resolve") {
      if (!body.conflict) {
        return { status: 400, headers, jsonBody: { error: "conflict is required" } };
      }
      const raw = await callAI(provider, apiKey, RESOLVE_SYSTEM,
        `Conflict detected:\n${body.conflict.description}\n\nAffected policies:\n${body.conflict.policies.join("\n")}`, 1000, az.endpoint, az.deployment);
      const result: ResolveResponse = JSON.parse(stripMarkdownJson(raw));
      return { status: 200, headers, jsonBody: result };
    }

    // ── compliance ─────────────────────────────────────────────────────────────
    if (body.mode === "compliance") {
      if (!body.tenantSummary) {
        return { status: 400, headers, jsonBody: { error: "tenantSummary is required" } };
      }
      const trimmedSummary = {
        ...body.tenantSummary,
        unassignedPolicies: body.tenantSummary.unassignedPolicies.slice(0, 50),
        unassignedPoliciesTotal: body.tenantSummary.unassignedPolicies.length,
      };
      const raw = await callAI(provider, apiKey, COMPLIANCE_SYSTEM,
        `Generate a compliance posture report for this Intune tenant:\n\n${JSON.stringify(trimmedSummary, null, 2)}`, 8192, az.endpoint, az.deployment);

      if (!raw) {
        return { status: 500, headers, jsonBody: { error: "Empty response from AI model" } };
      }
      let result: ComplianceResponse;
      try {
        result = JSON.parse(stripMarkdownJson(raw));
      } catch {
        context.error("Failed to parse compliance JSON. Raw:", raw.slice(0, 500));
        return { status: 500, headers, jsonBody: { error: "AI returned an unexpected format. Please try again." } };
      }
      return { status: 200, headers, jsonBody: result };
    }

    return { status: 400, headers, jsonBody: { error: `Unknown mode: ${body.mode}` } };

  } catch (err) {
    context.error("AI API error:", err);

    // Anthropic: nested error object
    if (err && typeof err === "object" && "status" in err) {
      const apiErr = err as { status: number; error?: { error?: { message?: string } } };
      const nestedMsg = apiErr.error?.error?.message;
      if (nestedMsg?.includes("credit balance")) {
        return { status: 402, headers, jsonBody: { error: "Insufficient credits. Top up your account." } };
      }
      if (nestedMsg) {
        return { status: apiErr.status, headers, jsonBody: { error: nestedMsg } };
      }
    }

    // OpenAI / Gemini: message is usually on the error directly
    const msg = err instanceof Error ? err.message : "Internal error";
    return { status: 500, headers, jsonBody: { error: msg } };
  }
}

app.http("claude", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "claude",
  handler: claudeHandler,
});
