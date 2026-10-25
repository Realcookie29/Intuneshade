/** Replaces quoted names and e-mail addresses so tenant identifiers don't reach a hosted model. */
export function maskFacts(facts: string[]): string[] {
  return facts.map((f) =>
    f
      .replace(/"[^"]*"/g, '"[name]"')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[user]"),
  );
}
