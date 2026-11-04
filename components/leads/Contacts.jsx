import Icon from "@/components/ui/Icon";

const channels = [
  { key: "email", label: "Email", icon: "mail" },
  { key: "phone", label: "Phone", icon: "phone" },
  { key: "whatsapp", label: "WhatsApp", icon: "whatsapp" },
];

const iconTone = {
  verified: "text-verified",
  available: "text-success",
  missing: "text-border-strong opacity-60",
};

const pillTone = {
  verified: "border-verified-border bg-verified-bg text-verified",
  available: "border-success-border bg-success-bg text-success",
  missing: "border-danger-border bg-danger-bg text-danger",
};

const stateLabel = { verified: "verified", available: "available", missing: "missing" };

// Compact icon row used in the dashboard's recent leads table.
export function ContactIcons({ contacts }) {
  return (
    <ul className="m-0 flex list-none gap-2.5 p-0">
      {channels.map((channel) => (
        <li
          key={channel.key}
          className={`inline-flex ${iconTone[contacts[channel.key]]}`}
          title={`${channel.label} ${stateLabel[contacts[channel.key]]}`}
        >
          <Icon name={channel.icon} className="size-[17px]" />
          <span className="sr-only">
            {channel.label} {stateLabel[contacts[channel.key]]}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Labeled pills used in the leads table and the lead modal.
export function ContactPills({ contacts }) {
  return (
    <ul className="m-0 flex list-none flex-col items-start gap-1 p-0">
      {channels.map((channel) => {
        const state = contacts[channel.key];
        return (
          <li
            key={channel.key}
            className={`inline-flex items-center gap-1 rounded-full border py-[3px] pr-2 pl-[5px] text-[11px] leading-none font-[650] whitespace-nowrap ${pillTone[state]}`}
          >
            <Icon name={channel.icon} className="size-3 flex-none" />
            <span className={state === "missing" ? "line-through decoration-current/45" : ""}>{channel.label}</span>
            <span className="sr-only">{stateLabel[state]}</span>
          </li>
        );
      })}
    </ul>
  );
}
