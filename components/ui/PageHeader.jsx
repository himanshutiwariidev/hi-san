export default function PageHeader({ title, description, children, titleClassName = "text-[28px]" }) {
  return (
    <div className="flex items-start justify-between gap-4 max-[760px]:flex-col max-[760px]:items-stretch">
      <div>
        <h1 className={`m-0 mb-1.5 font-bold ${titleClassName}`}>{title}</h1>
        {description ? <p className="m-0 text-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
