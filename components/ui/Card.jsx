export default function Card({ as: Tag = "section", className = "", ...props }) {
  return <Tag className={`min-w-0 rounded-[18px] border border-border bg-surface p-[18px] ${className}`} {...props} />;
}
