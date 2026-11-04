import StatusPill from "@/components/ui/StatusPill";

const statusMap = {
  pending: { tone: "muted", label: "Buying…" },
  retrieved: { tone: "success", label: "Retrieved" },
  filtered: { tone: "warning", label: "Filtered" },
  not_retrieved: { tone: "danger", label: "Not retrieved" },
};

export default function LeadStatus({ status }) {
  const { tone, label } = statusMap[status] ?? statusMap.pending;
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
