"use client";

import { useState } from "react";
import { flagCode } from "@/lib/countries";

export default function CountryFlag({ country, showName = true }) {
  const [failed, setFailed] = useState(false);
  const code = country.flag ?? flagCode(country.code, country.name);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {code && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://flagcdn.com/w20/${code}.png`}
          alt=""
          width={20}
          height={14}
          onError={() => setFailed(true)}
          className="rounded-[2px] object-cover align-middle"
        />
      ) : null}
      {showName ? <span className="truncate">{country.name || "Unknown"}</span> : null}
    </span>
  );
}
