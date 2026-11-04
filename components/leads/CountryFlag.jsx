export default function CountryFlag({ country, showName = true }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {country.code ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://flagcdn.com/w20/${country.code}.png`}
          alt=""
          width={20}
          height={14}
          className="rounded-[2px] object-cover align-middle"
        />
      ) : null}
      {showName ? <span className="truncate">{country.name || "Unknown"}</span> : null}
    </span>
  );
}
