import { useState, useMemo, useCallback } from "react";
import {
  Button, Text, Spinner, Badge, Combobox, Option, Input,
  Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  MessageBar, MessageBarBody,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  PeopleTeam24Regular, SearchRegular, DismissRegular, PersonAddRegular,
  DeleteRegular, ArrowClockwiseRegular, PersonRegular, LaptopRegular,
} from "@fluentui/react-icons";
import { useGroups } from "../../hooks/useGroups";
import type { DirectoryMember, GroupDetail } from "../../types/graphTypes";
import {
  fetchGroupDetail, fetchMembers, searchDirectoryObjects,
  addMember, removeMember, isDynamicGroup, memberKind,
} from "../../services/groupMembershipService";
import PageHeader from "../layout/PageHeader";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  hero: {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)",
    padding: "24px 32px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "24px", flexWrap: "wrap",
  },
  heroLeft: { display: "flex", flexDirection: "column", gap: "4px" },
  heroTitle: { color: "white", fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
  heroSub: { color: "rgba(255,255,255,0.65)", fontSize: tokens.fontSizeBase300, maxWidth: "560px" },
  bar: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "16px 24px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2, flexWrap: "wrap",
  },
  combobox: { minWidth: "320px", maxWidth: "480px" },
  info: {
    padding: "12px 24px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  content: { flex: 1, overflow: "auto" },
  table: { width: "100%", minWidth: "620px" },
  headerRow: { backgroundColor: tokens.colorNeutralBackground3 },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2, textTransform: "uppercase",
    letterSpacing: "0.04em", padding: "10px 12px", whiteSpace: "nowrap",
  },
  cell: { padding: "9px 12px", verticalAlign: "middle" },
  kindCell: { display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100%", gap: "12px",
    color: tokens.colorNeutralForeground3, padding: "48px", textAlign: "center",
  },
  rule: {
    fontFamily: "monospace", fontSize: tokens.fontSizeBase200,
    background: tokens.colorNeutralBackground3, padding: "2px 6px", borderRadius: "4px",
  },
});

function KindBadge({ m }: { m: DirectoryMember }) {
  const kind = memberKind(m);
  if (kind === "device") return <span><LaptopRegular /> Device</span>;
  if (kind === "group") return <span><PeopleTeam24Regular style={{ fontSize: 16 }} /> Group</span>;
  return <span><PersonRegular /> User</span>;
}

export default function GroupMembershipPage() {
  const styles = useStyles();
  const { groups, isLoading: groupsLoading } = useGroups();

  const [inputValue, setInputValue] = useState("");
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState<DirectoryMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filteredGroupOptions = useMemo(() => {
    const q = inputValue.toLowerCase();
    return (q ? groups.filter((g) => g.displayName.toLowerCase().includes(q)) : groups).slice(0, 100);
  }, [groups, inputValue]);

  const loadGroup = useCallback(async (groupId: string) => {
    setLoading(true);
    setError(null);
    setMembers([]);
    try {
      const [detail, mem] = await Promise.all([fetchGroupDetail(groupId), fetchMembers(groupId)]);
      mem.sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));
      setGroup(detail);
      setMembers(mem);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = (_: unknown, data: { optionValue?: string; optionText?: string }) => {
    if (!data.optionValue) return;
    setInputValue(data.optionText ?? "");
    loadGroup(data.optionValue);
  };

  const refresh = () => { if (group) loadGroup(group.id); };

  const dynamic = group ? isDynamicGroup(group) : false;

  const filteredMembers = useMemo(() => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.displayName, m.userPrincipalName, m.mail].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [members, memberFilter]);

  const confirmRemove = async () => {
    if (!group || !removing) return;
    setBusyId(removing.id);
    try {
      await removeMember(group.id, removing.id);
      setRemoving(null);
      await loadGroup(group.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="Directory"
        title="Group Membership"
        subtitle="View and manage the users and devices inside your Entra ID security groups — add or remove members without leaving the app."
        icon={<PeopleTeam24Regular />}
      />

      <div className={styles.bar}>
        <Combobox
          className={styles.combobox}
          placeholder={groupsLoading ? "Loading groups…" : "Search for a group…"}
          value={inputValue}
          onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
          onOptionSelect={handleSelect}
          disabled={groupsLoading}
          freeform
        >
          {filteredGroupOptions.map((g) => (
            <Option key={g.id} value={g.id} text={g.displayName}>{g.displayName}</Option>
          ))}
        </Combobox>
        {group && (
          <Button appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        )}
      </div>

      {group && (
        <div className={styles.info}>
          <Text weight="semibold" size={400}>{group.displayName}</Text>
          <Badge appearance="tint" color={dynamic ? "warning" : "brand"}>
            {dynamic ? "Dynamic" : "Assigned"}
          </Badge>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {members.length} member{members.length === 1 ? "" : "s"}
          </Text>
          {group.description && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>· {group.description}</Text>
          )}
          {dynamic && group.membershipRule && (
            <Text size={200}>Rule: <span className={styles.rule}>{group.membershipRule}</span></Text>
          )}
          <div style={{ marginLeft: "auto" }}>
            <Button
              appearance="primary"
              icon={<PersonAddRegular />}
              onClick={() => setShowAdd(true)}
              disabled={dynamic}
              title={dynamic ? "Dynamic groups are managed by their rule" : undefined}
            >
              Add member
            </Button>
          </div>
        </div>
      )}

      <div className={styles.content}>
        {error && (
          <div style={{ padding: "12px 24px" }}>
            <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
          </div>
        )}

        {!group && !loading && (
          <div className={styles.empty}>
            <PeopleTeam24Regular style={{ fontSize: 48 }} />
            <Text size={500} weight="semibold">Select a group</Text>
            <Text size={300}>Search for a group above to view and manage its members.</Text>
          </div>
        )}

        {loading && (
          <div className={styles.empty}><Spinner size="large" /><Text>Loading members…</Text></div>
        )}

        {group && !loading && (
          <>
            {members.length > 5 && (
              <div style={{ padding: "10px 24px" }}>
                <Input
                  placeholder="Filter members…"
                  value={memberFilter}
                  onChange={(_, d) => setMemberFilter(d.value)}
                  contentBefore={<SearchRegular />}
                  contentAfter={
                    memberFilter ? (
                      <Button size="small" appearance="transparent" icon={<DismissRegular />}
                        onClick={() => setMemberFilter("")} style={{ minWidth: 0, padding: "0 2px" }} />
                    ) : undefined
                  }
                  style={{ maxWidth: 320 }}
                />
              </div>
            )}
            {filteredMembers.length === 0 ? (
              <div className={styles.empty}>
                <Text size={400} weight="semibold">
                  {members.length === 0 ? "This group has no members" : "No members match your filter"}
                </Text>
              </div>
            ) : (
              <Table className={styles.table}>
                <TableHeader>
                  <TableRow className={styles.headerRow}>
                    <TableHeaderCell className={styles.headerCell}>Type</TableHeaderCell>
                    <TableHeaderCell className={styles.headerCell}>Name</TableHeaderCell>
                    <TableHeaderCell className={styles.headerCell}>UPN / Device ID</TableHeaderCell>
                    <TableHeaderCell className={styles.headerCell} style={{ width: 60 }} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className={styles.cell}>
                        <span className={styles.kindCell}><KindBadge m={m} /></span>
                      </TableCell>
                      <TableCell className={styles.cell}>
                        <Text size={300} weight="semibold">{m.displayName || "—"}</Text>
                        {m.jobTitle && (
                          <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
                            {m.jobTitle}
                          </Text>
                        )}
                      </TableCell>
                      <TableCell className={styles.cell}>
                        <Text size={200}>{m.userPrincipalName || m.deviceId || m.mail || "—"}</Text>
                      </TableCell>
                      <TableCell className={styles.cell}>
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={busyId === m.id ? <Spinner size="tiny" /> : <DeleteRegular />}
                          onClick={() => setRemoving(m)}
                          disabled={dynamic || busyId !== null}
                          title={dynamic ? "Dynamic membership can't be edited" : "Remove member"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>

      {showAdd && group && (
        <AddMemberDialog
          groupId={group.id}
          existingIds={new Set(members.map((m) => m.id))}
          onDone={() => { setShowAdd(false); refresh(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {removing && (
        <Dialog open modalType="alert" onOpenChange={(_, d) => { if (!d.open && !busyId) setRemoving(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Remove member</DialogTitle>
              <DialogContent>
                Remove <strong>{removing.displayName}</strong> from <strong>{group?.displayName}</strong>?
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setRemoving(null)} disabled={!!busyId}>Cancel</Button>
                <Button appearance="primary" onClick={confirmRemove} disabled={!!busyId}
                  icon={busyId ? <Spinner size="tiny" /> : <DeleteRegular />}>
                  Remove
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}

// ─── Add member dialog ────────────────────────────────────────────────────────

function AddMemberDialog({
  groupId, existingIds, onDone, onCancel,
}: {
  groupId: string;
  existingIds: Set<string>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const found = await searchDirectoryObjects(query);
      setResults(found.filter((r) => !existingIds.has(r.id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const add = async (m: DirectoryMember) => {
    setAdding(m.id);
    setError(null);
    try {
      await addMember(groupId, m.id);
      setResults((prev) => prev.filter((r) => r.id !== m.id));
      setAddedCount((c) => c + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) (addedCount ? onDone : onCancel)(); }}>
      <DialogSurface style={{ maxWidth: 560 }}>
        <DialogBody>
          <DialogTitle>Add member</DialogTitle>
          <DialogContent style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                placeholder="Search users or devices by name…"
                value={query}
                onChange={(_, d) => setQuery(d.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                contentBefore={<SearchRegular />}
                style={{ flex: 1 }}
              />
              <Button appearance="primary" onClick={runSearch}
                disabled={searching || !query.trim()}
                icon={searching ? <Spinner size="tiny" /> : undefined}>
                Search
              </Button>
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {results.map((m) => (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 8px", borderRadius: 4, border: "1px solid #eee",
                }}>
                  {memberKind(m) === "device" ? <LaptopRegular /> : <PersonRegular />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size={300} weight="semibold" style={{ display: "block" }}>{m.displayName}</Text>
                    <Text size={200} style={{ color: "#888" }}>{m.userPrincipalName || m.deviceId || ""}</Text>
                  </div>
                  <Button size="small" appearance="primary"
                    icon={adding === m.id ? <Spinner size="tiny" /> : <PersonAddRegular />}
                    onClick={() => add(m)} disabled={adding !== null}>
                    Add
                  </Button>
                </div>
              ))}
              {!searching && query && results.length === 0 && (
                <Text size={200} style={{ color: "#888", padding: "8px" }}>
                  No matching users or devices found. Try a different search.
                </Text>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={addedCount ? onDone : onCancel}>
              {addedCount ? `Done (${addedCount} added)` : "Close"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
