// @bun
import{createHash as w,verify as x}from"crypto";import{existsSync as h,mkdirSync as y,readFileSync as p,writeFileSync as f}from"fs";import s from"path";import L from"os";function v(e){let t=e.indexOf("--base-url"),n=e.indexOf("--update-base-url"),r=e.indexOf("--collector-home")!==-1?e.indexOf("--collector-home"):e.indexOf("--runner-home"),o=e.indexOf("--public-key-file"),i=(t!==-1?e[t+1]:process.env.AUCTION_BASE_URL||"https://auc.ldev.cloud").replace(/\/$/,"");return{baseUrl:i,updateBaseUrl:(n!==-1?e[n+1]:process.env.AUCTION_COLLECTOR_UPDATE_BASE_URL||`${i}/collector/runtime`).replace(/\/$/,""),runnerHome:r!==-1?e[r+1]:s.join(L.homedir(),".cache","lnh-auction-collector"),publicKeyFile:o!==-1?e[o+1]:process.env.AUCTION_COLLECTOR_PUBLIC_KEY_FILE||process.env.AUCTION_RUNNER_PUBLIC_KEY_FILE||"",passthroughArgs:e.filter((a,l)=>{if(["--base-url","--update-base-url","--collector-home","--runner-home","--public-key-file"].includes(a))return!1;if(l>0&&["--base-url","--update-base-url","--collector-home","--runner-home","--public-key-file"].includes(e[l-1]))return!1;return!0})}}function C(e){let t=e.indexOf("--site");if(t===-1||!e[t+1])return["copart","iaai"];let n=Array.from(new Set(e[t+1].split(",").map((r)=>r.trim().toLowerCase()).filter((r)=>r==="copart"||r==="iaai")));return n.length>0?n:["copart","iaai"]}function T(e){let t=[];for(let n=0;n<e.length;n+=1){if(e[n]==="--site"){n+=1;continue}t.push(e[n])}return t}function S(e){return w("sha256").update(e).digest("hex")}async function z(e){let t=await fetch(e,{headers:{"cache-control":"no-store"}});if(!t.ok)throw Error(`HTTP ${t.status} for ${e}`);return await t.text()}async function E(e){let t=await fetch(`${e}/manifest.json`,{headers:{"cache-control":"no-store"}});if(!t.ok)throw Error(`HTTP ${t.status} for ${e}/manifest.json`);return await t.json()}function k(e,t,n){if(!x(null,Buffer.from(JSON.stringify(e),"utf8"),n,Buffer.from(t,"base64")))throw Error("Runner manifest signature is invalid.")}async function R(e,t,n){let r=await fetch(e,{headers:{"cache-control":"no-store"}});if(!r.ok)throw Error(`HTTP ${r.status} for ${e}`);let o=new Uint8Array(await r.arrayBuffer()),i=S(o);if(i!==n)throw Error(`Hash mismatch for ${e}: expected ${n}, got ${i}`);y(s.dirname(t),{recursive:!0}),f(t,o)}function N(e,t){let n=t.split("/").map((r)=>encodeURIComponent(r)).join("/");return`${e}/${n}`}function $(e){return e.replace(/^\/\* bootstrap runtime patches:[^\n]* \*\/\n?/gm,"")}function d(e,t,n,r){for(let o of t)if(e.includes(o))return e.replace(o,n);throw Error(`Collector runtime patch could not find expected snippet for ${r}.`)}function A(e,t){let n=s.join(e,t.entrypoint),r=p(n,"utf8");if(t.entrypoint.endsWith(".js")){console.warn(`Skipping collector runtime patch for built entrypoint ${t.entrypoint}. Refresh collector/release instead of patching compiled output.`);return}let o="/* bootstrap runtime patches: iaai-location-v2 target-blacklist-v1 */";if(r.includes(o))return;let i=$(r);i=d(i,["const readTitleValue = (node: ParentNode, prefix: string) =>\n      normalize(node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`)?.textContent);","const readTitleValue = (node: ParentNode, prefix: string) => {\n      const element = node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`);\n      const value = element?.getAttribute(\\\"title\\\") || element?.textContent || \\\"\\\";\n      return normalize(value.replace(new RegExp(`^${prefix}\\\\s*`, \\\"i\\\"), \\\"\\\"));\n    };"],"const readTitleValue = (node: ParentNode, prefix: string) => {\n      const element = node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`);\n      const value = element?.getAttribute(\\\"title\\\") || element?.textContent || \\\"\\\";\n      return normalize(value.replace(new RegExp(`^${prefix}\\\\s*`, \\\"i\\\"), \\\"\\\"));\n    };","iaai readTitleValue"),i=d(i,["const branch = normalize(block.querySelector<HTMLElement>('a[aria-label=\\\"Branch Name\\\"]')?.textContent);",`const branchElement = block.querySelector<HTMLElement>('a[aria-label=\\"Branch Name\\"]');
      const branch = normalize(branchElement?.getAttribute(\\"title\\") || branchElement?.textContent);`],`const branchElement = block.querySelector<HTMLElement>('a[aria-label=\\"Branch Name\\"]');
      const branch = normalize(branchElement?.getAttribute(\\"title\\") || branchElement?.textContent);`,"iaai branch extraction"),i=d(i,["const vehicleLocation = normalize(block.querySelector<HTMLElement>('.text-md[title^=\\\"Vehicle Location:\\\"]')?.textContent);",`const vehicleLocationElement = block.querySelector<HTMLElement>('.text-md[title^=\\"Vehicle Location:\\"]');
      const vehicleLocation = normalize(
        (vehicleLocationElement?.getAttribute(\\"title\\") || vehicleLocationElement?.textContent || \\"\\")
          .replace(/^Vehicle Location:\\\\s*/i, \\"\\"),
      );`],`const vehicleLocationElement = block.querySelector<HTMLElement>('.text-md[title^=\\"Vehicle Location:\\"]');
      const vehicleLocation = normalize(
        (vehicleLocationElement?.getAttribute(\\"title\\") || vehicleLocationElement?.textContent || \\"\\")
          .replace(/^Vehicle Location:\\\\s*/i, \\"\\"),
      );`,"iaai vehicle location extraction"),i=d(i,[`function normalizeColorValue(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }
  return toTitleCase(normalized.replace(/[.,;:\\-\u2013]+$/, ""));
}`],`function normalizeColorValue(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }
  return toTitleCase(normalized.replace(/[.,;:\\-\u2013]+$/, ""));
}

function normalizeTargetFilterList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeWhitespace(String(value || ""));
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeLocationForTargetFilter(value: string | null | undefined): string {
  return normalizeWhitespace(String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " "));
}

function matchesTargetBlacklist(target: VinTarget, record: { color?: string | null; location?: string | null }): boolean {
  const rejectColors = normalizeTargetFilterList((target as any).rejectColors);
  if (rejectColors.length > 0) {
    const normalizedColor = normalizeWhitespace(String(record.color || "")).toLowerCase();
    if (normalizedColor && rejectColors.some((value) => value.toLowerCase() === normalizedColor)) {
      return true;
    }
  }

  const rejectLocations = normalizeTargetFilterList((target as any).rejectLocations);
  if (rejectLocations.length === 0) {
    return false;
  }

  const normalizedLocation = normalizeLocationForTargetFilter(record.location);
  if (!normalizedLocation) {
    return false;
  }
  const locationTokens = new Set(normalizedLocation.split(" "));
  return rejectLocations.some((value) => {
    const normalizedNeedle = normalizeLocationForTargetFilter(value);
    if (!normalizedNeedle) {
      return false;
    }
    return normalizedNeedle.includes(" ")
      ? normalizedLocation.includes(normalizedNeedle)
      : locationTokens.has(normalizedNeedle);
  });
}`,"target blacklist helpers"),i=d(i,[`  const record: ScrapedLotRecord = {
    sourceKey,
    sourceLabel: sourceKey === "iaai" ? "IAAI" : "Copart",
    targetKey: target.key,
    yearPage,
    carType: target.carType,
    marker: target.marker,
    vinPattern: matchedCode,
    modelYear,
    vin,
    lotNumber: extractLot(text, candidate.url),
    sourceDetailId: sourceKey === "iaai" ? candidate.url.match(/\\/VehicleDetail\\/(\\d+)/i)?.[1] || null : null,
    vehicleTitle: normalizeVehicleTitle(candidate.title || ""),
    status,
    auctionDate,
    auctionDateRaw,
    location: extractLocation(text),
    url: candidate.url,
    evidence: text,
    color: candidate.color ?? extractColorValue(text),
    sourceRaw: candidate.sourceRaw,
  };
  if (!record.lotNumber) {`],`  const record: ScrapedLotRecord = {
    sourceKey,
    sourceLabel: sourceKey === "iaai" ? "IAAI" : "Copart",
    targetKey: target.key,
    yearPage,
    carType: target.carType,
    marker: target.marker,
    vinPattern: matchedCode,
    modelYear,
    vin,
    lotNumber: extractLot(text, candidate.url),
    sourceDetailId: sourceKey === "iaai" ? candidate.url.match(/\\/VehicleDetail\\/(\\d+)/i)?.[1] || null : null,
    vehicleTitle: normalizeVehicleTitle(candidate.title || ""),
    status,
    auctionDate,
    auctionDateRaw,
    location: extractLocation(text),
    url: candidate.url,
    evidence: text,
    color: candidate.color ?? extractColorValue(text),
    sourceRaw: candidate.sourceRaw,
  };
  if (matchesTargetBlacklist(target, record)) {
    return { value: null, filterReason: "identity" };
  }
  if (!record.lotNumber) {`,"buildRecord target blacklist"),i=d(i,[`  const record: ScrapedLotRecord = {
    sourceKey: "copart",
    sourceLabel: "Copart",
    targetKey: target.key,
    yearPage: Number(item.lcy) || null,
    carType: target.carType,
    marker: target.marker,
    vinPattern: matchedCode,
    modelYear: Number(item.lcy) || null,
    vin,
    lotNumber: String(item.lotNumberStr || ""),
    sourceDetailId: null,
    vehicleTitle,
    status,
    auctionDate: dateInfo.value,
    auctionDateRaw: dateInfo.raw,
    location: item.yn || item.syn || "",
    url: \`https://www.copart.com/lot/\${item.lotNumberStr}/\${item.ldu || ""}\`.replace(/\\/$/, ""),
    evidence: text,
    color: normalizeColorValue(item.clr) || extractColorValue([item.lcd, item.ld, item.ess].filter(Boolean).join(" ")),
    sourceRaw: {
      source: "copart-search-api",
      item,
    },
  };
  if (!record.lotNumber) {`],`  const record: ScrapedLotRecord = {
    sourceKey: "copart",
    sourceLabel: "Copart",
    targetKey: target.key,
    yearPage: Number(item.lcy) || null,
    carType: target.carType,
    marker: target.marker,
    vinPattern: matchedCode,
    modelYear: Number(item.lcy) || null,
    vin,
    lotNumber: String(item.lotNumberStr || ""),
    sourceDetailId: null,
    vehicleTitle,
    status,
    auctionDate: dateInfo.value,
    auctionDateRaw: dateInfo.raw,
    location: item.yn || item.syn || "",
    url: \`https://www.copart.com/lot/\${item.lotNumberStr}/\${item.ldu || ""}\`.replace(/\\/$/, ""),
    evidence: text,
    color: normalizeColorValue(item.clr) || extractColorValue([item.lcd, item.ld, item.ess].filter(Boolean).join(" ")),
    sourceRaw: {
      source: "copart-search-api",
      item,
    },
  };
  if (matchesTargetBlacklist(target, record)) {
    return { value: null, filterReason: "identity" };
  }
  if (!record.lotNumber) {`,"buildCopartApiRecord target blacklist"),f(n,`${o}
${i}`)}async function U(e,t,n){let r=s.join(t,"versions",n.version),o=s.join(r,"manifest.json");y(r,{recursive:!0});let i=!h(o);if(!i)try{let l=JSON.parse(p(o,"utf8"));i=JSON.stringify(l.files)!==JSON.stringify(n.files)}catch{i=!0}if(i){for(let m of n.files){let c=s.join(r,m.path);await R(N(e,m.path),c,m.sha256)}f(o,JSON.stringify(n,null,2));let u=await Bun.spawn(["bun","install"],{cwd:r,stdout:"inherit",stderr:"inherit",stdin:"ignore"}).exited;if(u!==0)throw Error(`bun install failed with exit code ${u}`)}let a=s.join(r,".playwright-installed");if(!h(a)){let u=await Bun.spawn(["bunx","playwright","install","chromium"],{cwd:r,stdout:"inherit",stderr:"inherit",stdin:"ignore"}).exited;if(u!==0)throw Error(`playwright install failed with exit code ${u}`);f(a,new Date().toISOString())}return A(r,n),f(s.join(t,"current-version.txt"),n.version),r}function g({versionDir:e,manifest:t,baseUrl:n,updateBaseUrl:r,passthroughArgs:o,siteKey:i}){let a=["bun","run",t.entrypoint,"--base-url",n,"--update-base-url",r,...o,...i?["--site",i]:[]];return Bun.spawn(a,{cwd:e,stdout:"inherit",stderr:"inherit",stdin:"inherit",env:process.env})}async function I(){let e=v(process.argv.slice(2));if(!e.publicKeyFile)throw Error("Set AUCTION_COLLECTOR_PUBLIC_KEY_FILE or pass --public-key-file before running the collector bootstrap.");let t=p(e.publicKeyFile,"utf8"),n=await E(e.updateBaseUrl),r=await z(`${e.updateBaseUrl}/manifest.sig`);k(n,r.trim(),t);let o=await U(e.updateBaseUrl,e.runnerHome,n),i=C(e.passthroughArgs),a=T(e.passthroughArgs);if(i.length<=1){let b=await g({versionDir:o,manifest:n,baseUrl:e.baseUrl,updateBaseUrl:e.updateBaseUrl,passthroughArgs:a,siteKey:i[0]}).exited;process.exit(b)}let l=i.map((c)=>g({versionDir:o,manifest:n,baseUrl:e.baseUrl,updateBaseUrl:e.updateBaseUrl,passthroughArgs:a,siteKey:c})),m=(await Promise.all(l.map(async(c)=>await c.exited))).find((c)=>c!==0);process.exit(m??0)}await I().catch((e)=>{console.error(e instanceof Error?e.message:String(e)),process.exit(1)});
