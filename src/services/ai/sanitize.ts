// Removes fields that can carry credentials before policy JSON is sent to an
// external AI provider: script bodies (scripts sometimes embed passwords or
// tokens) and password / secret / shared-key values.

const SENSITIVE_KEY = /(scriptcontent|password|secret|sharedkey|presharedkey)$/i;

export function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSensitive) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        [k, SENSITIVE_KEY.test(k) && v !== null && v !== "" ? "[removed by IntuneShade]" : stripSensitive(v)]),
    ) as T;
  }
  return value;
}
