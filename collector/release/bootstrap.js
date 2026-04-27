// @bun
import{createHash as _,verify as w}from"crypto";import{existsSync as h,mkdirSync as b,readFileSync as p,writeFileSync as m}from"fs";import s from"path";import L from"os";function R(e){let n=e.indexOf("--base-url"),t=e.indexOf("--update-base-url"),r=e.indexOf("--collector-home")!==-1?e.indexOf("--collector-home"):e.indexOf("--runner-home"),a=e.indexOf("--public-key-file"),i=(n!==-1?e[n+1]:process.env.AUCTION_BASE_URL||"https://auc.ldev.cloud").replace(/\/$/,"");return{baseUrl:i,updateBaseUrl:(t!==-1?e[t+1]:process.env.AUCTION_COLLECTOR_UPDATE_BASE_URL||`${i}/collector/runtime`).replace(/\/$/,""),runnerHome:r!==-1?e[r+1]:s.join(L.homedir(),".cache","lnh-auction-collector"),publicKeyFile:a!==-1?e[a+1]:process.env.AUCTION_COLLECTOR_PUBLIC_KEY_FILE||process.env.AUCTION_RUNNER_PUBLIC_KEY_FILE||"",passthroughArgs:e.filter((o,l)=>{if(["--base-url","--update-base-url","--collector-home","--runner-home","--public-key-file"].includes(o))return!1;if(l>0&&["--base-url","--update-base-url","--collector-home","--runner-home","--public-key-file"].includes(e[l-1]))return!1;return!0})}}function E(e){let n=e.indexOf("--site");if(n===-1||!e[n+1])return["copart","iaai"];let t=Array.from(new Set(e[n+1].split(",").map((r)=>r.trim().toLowerCase()).filter((r)=>r==="copart"||r==="iaai")));return t.length>0?t:["copart","iaai"]}function P(e){let n=[];for(let t=0;t<e.length;t+=1){if(e[t]==="--site"){t+=1;continue}n.push(e[t])}return n}function C(e){return _("sha256").update(e).digest("hex")}async function S(e){let n=await fetch(e,{headers:{"cache-control":"no-store"}});if(!n.ok)throw Error(`HTTP ${n.status} for ${e}`);return await n.text()}async function T(e){let n=await fetch(`${e}/manifest.json`,{headers:{"cache-control":"no-store"}});if(!n.ok)throw Error(`HTTP ${n.status} for ${e}/manifest.json`);return await n.json()}function $(e,n,t){if(!w(null,Buffer.from(JSON.stringify(e),"utf8"),t,Buffer.from(n,"base64")))throw Error("Runner manifest signature is invalid.")}async function A(e,n,t){let r=await fetch(e,{headers:{"cache-control":"no-store"}});if(!r.ok)throw Error(`HTTP ${r.status} for ${e}`);let a=new Uint8Array(await r.arrayBuffer()),i=C(a);if(i!==t)throw Error(`Hash mismatch for ${e}: expected ${t}, got ${i}`);b(s.dirname(n),{recursive:!0}),m(n,a)}function k(e,n){let t=n.split("/").map((r)=>encodeURIComponent(r)).join("/");return`${e}/${t}`}function v(e){return e.replace(/^\/\* bootstrap runtime patches:[^\n]* \*\/\n?/gm,"")}function d(e,n,t,r){for(let a of n)if(e.includes(a))return e.replace(a,t);throw Error(`Collector runtime patch could not find expected snippet for ${r}.`)}function g(e,n,t,r){for(let a of n)if(e.includes(a))return console.warn(`Applied collector runtime debug patch: ${r}.`),e.replace(a,t);return console.warn(`Skipped collector runtime debug patch: could not find ${r}.`),e}function N(e){if(e.includes("/* bootstrap runtime patches: built-vin-debug-v3 */"))return e;let t=v(e),r=`
function __collectorVinDebugEnabled(){
  const value=String(process.env.AUCTION_COLLECTOR_VIN_DEBUG||"").trim().toLowerCase();
  return value==="1"||value==="true"||value==="yes"||value==="on"||value==="debug";
}
function __collectorVinDebug(event,payload={}){
  if(!__collectorVinDebugEnabled())return;
  console.log(JSON.stringify({message:"collector vin debug",event,pid:process.pid,argv:process.argv,...payload},null,2));
}
function __collectorVinPrefix(value){
  const normalized=String(value||"").toUpperCase().replace(/\\s+/g,"").replace(/[?*]/g,"*");
  const wildcardIndex=normalized.indexOf("*");
  return wildcardIndex===-1?normalized:normalized.slice(0,wildcardIndex);
}
function __collectorVinTargetSummary(target,index){
  const vinPattern=String(target?.vinPattern||"");
  return {
    index,
    key:target?.key,
    label:target?.label,
    carType:target?.carType,
    marker:target?.marker,
    vinPattern,
    vinPrefix:target?.vinPrefix,
    derivedPrefix:__collectorVinPrefix(vinPattern),
    yearFrom:target?.yearFrom,
    yearTo:target?.yearTo,
    copartSlug:target?.copartSlug,
    iaaiPath:target?.iaaiPath,
    enabledCopart:target?.enabledCopart,
    enabledIaai:target?.enabledIaai,
    active:target?.active,
    sortOrder:target?.sortOrder
  };
}
function __collectorVinTextPreview(value){
  return String(value||"").replace(/\\s+/g," ").trim().slice(0,260);
}
`;return t=t.startsWith(`// @bun
`)?t.replace(`// @bun
`,`// @bun
${r}
`):`${r}
${t}`,t=g(t,['async function Z2(E,L){return await JE(`${E}/api/scrape-config`,{headers:{authorization:`Bearer ${L}`,"cache-control":"no-store"}})}'],'async function Z2(E,L){let _=await JE(`${E}/api/scrape-config`,{headers:{authorization:`Bearer ${L}`,"cache-control":"no-store"}});__collectorVinDebug("config-loaded",{baseUrl:E,configVersion:_.configVersion,targetCount:Array.isArray(_.targets)?_.targets.length:0,targets:Array.isArray(_.targets)?_.targets.map(__collectorVinTargetSummary):[]});return _}',"built scrape config target dump"),t=g(t,['function X0(E,L=!1){let _=C(E);if(!_)return new RegExp(L?"^$":"($^)","i");let S=PE(_).replaceAll("\\\\*","[A-HJ-NPR-Z0-9*]"),R=Math.max(0,17-_.length),A=R?`[A-HJ-NPR-Z0-9*]{0,${R}}`:"",F=`${S}${A}`;return new RegExp(L?`^${F}$`:`(${F})`,"i`)}'.replace("\\`)}",'")}'),'function X0(E,L=!1){let _=C(E);if(!_)return new RegExp(L?"^$":"($^)","i");let S=PE(_).replaceAll("\\\\*","[A-HJ-NPR-Z0-9*]"),R=Math.max(0,17-_.length),A=R?`[A-HJ-NPR-Z0-9*]{0,${R}}`:"",F=`${S}${A}`;return new RegExp(L?`^${F}$`:`(${F})`,"i")}'],'function X0(E,L=!1){let _=C(E);if(!_){let D=new RegExp(L?"^$":"($^)","i");__collectorVinDebug("mask-regex-built",{inputMask:E,normalizedMask:_,anchored:L,regex:String(D)});return D}let S=PE(_).replaceAll("\\\\*","[A-HJ-NPR-Z0-9*]"),R=Math.max(0,17-_.length),A=R?`[A-HJ-NPR-Z0-9*]{0,${R}}`:"",F=`${S}${A}`,D=new RegExp(L?`^${F}$`:`(${F})`,"i");__collectorVinDebug("mask-regex-built",{inputMask:E,normalizedMask:_,derivedPrefix:__collectorVinPrefix(_),anchored:L,suffixLength:R,regex:String(D)});return D}',"built VIN regex builder"),t=g(t,['function U0(E="",L){let _=C(E);if(!_)return null;return X0(L.vinPattern,!0).test(_)?C(L.vinPattern):null}'],'function U0(E="",L){let _=C(E);if(!_)return null;let S=X0(L.vinPattern,!0),R=S.test(_),A=R?C(L.vinPattern):null;__collectorVinDebug("vin-code-match",{targetKey:L?.key,vinOrPrefix:E,normalized:_,targetPattern:L?.vinPattern,targetPrefix:L?.vinPrefix,regex:String(S),matched:R,matchedPattern:A});return A}',"built VIN code matcher"),t=g(t,['function NE(E,L){let _=E.match(X0(L.vinPattern));return C(_?.[1]||"")}'],'function NE(E,L){let S=X0(L.vinPattern),_=E.match(S),R=C(_?.[1]||"");__collectorVinDebug("vin-extract",{targetKey:L?.key,targetPattern:L?.vinPattern,targetPrefix:L?.vinPrefix,regex:String(S),matchedVin:R,textPreview:R?undefined:__collectorVinTextPreview(E)});return R}',"built VIN extractor"),t=g(t,['function X2(E,L,_,S,R){let A=Y(_.text);if(!/\\/lot\\/\\d+/i.test(_.url)&&!/\\/VehicleDetail\\/\\d+/i.test(_.url))return{value:null,filterReason:"missing-lot-number"};if(!l(A,_.url||"",R))return{value:null,filterReason:"identity"};let F=NE(A,R);if(!F)return{value:null,filterReason:"vin"};'],'function X2(E,L,_,S,R){let A=Y(_.text);__collectorVinDebug("candidate-check",{sourceKey:E,targetKey:R?.key,targetPattern:R?.vinPattern,targetPrefix:R?.vinPrefix,yearPage:L,url:_?.url,title:_?.title,textPreview:__collectorVinTextPreview(A)});if(!/\\/lot\\/\\d+/i.test(_.url)&&!/\\/VehicleDetail\\/\\d+/i.test(_.url))return __collectorVinDebug("candidate-rejected",{sourceKey:E,targetKey:R?.key,reason:"missing-lot-number",url:_?.url,title:_?.title}),{value:null,filterReason:"missing-lot-number"};if(!l(A,_.url||"",R))return __collectorVinDebug("candidate-rejected",{sourceKey:E,targetKey:R?.key,reason:"identity",url:_?.url,title:_?.title,targetCarType:R?.carType,textPreview:__collectorVinTextPreview(A)}),{value:null,filterReason:"identity"};let F=NE(A,R);if(!F)return __collectorVinDebug("candidate-rejected",{sourceKey:E,targetKey:R?.key,reason:"vin",url:_?.url,title:_?.title,targetPattern:R?.vinPattern,targetPrefix:R?.vinPrefix,textPreview:__collectorVinTextPreview(A)}),{value:null,filterReason:"vin"};',"built candidate rejection start"),t=g(t,["if(Q)return{value:null,filterReason:Q};return{value:B,filterReason:null}}"],'if(Q)return __collectorVinDebug("candidate-rejected",{sourceKey:E,targetKey:R?.key,reason:Q,lotNumber:B?.lotNumber,vin:B?.vin,url:B?.url,auctionDate:B?.auctionDate,status:B?.status}),{value:null,filterReason:Q};__collectorVinDebug("candidate-accepted",{sourceKey:E,targetKey:R?.key,lotNumber:B?.lotNumber,vin:B?.vin,modelYear:B?.modelYear,auctionDate:B?.auctionDate,status:B?.status,location:B?.location,color:B?.color,url:B?.url});return{value:B,filterReason:null}}',"built candidate accepted/final rejection"),`/* bootstrap runtime patches: built-vin-debug-v3 */
${t}`}function z(e,n){let t=s.join(e,n.entrypoint),r=p(t,"utf8");if(n.entrypoint.endsWith(".js")){let o=N(r);if(o!==r)m(t,o),console.warn(`Applied collector runtime patch for built entrypoint ${n.entrypoint}.`);return}let a="/* bootstrap runtime patches: iaai-location-v2 target-blacklist-v1 */";if(r.includes(a))return;let i=v(r);i=d(i,["const readTitleValue = (node: ParentNode, prefix: string) =>\n      normalize(node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`)?.textContent);","const readTitleValue = (node: ParentNode, prefix: string) => {\n      const element = node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`);\n      const value = element?.getAttribute(\\\"title\\\") || element?.textContent || \\\"\\\";\n      return normalize(value.replace(new RegExp(`^${prefix}\\\\s*`, \\\"i\\\"), \\\"\\\"));\n    };"],"const readTitleValue = (node: ParentNode, prefix: string) => {\n      const element = node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`);\n      const value = element?.getAttribute(\\\"title\\\") || element?.textContent || \\\"\\\";\n      return normalize(value.replace(new RegExp(`^${prefix}\\\\s*`, \\\"i\\\"), \\\"\\\"));\n    };","iaai readTitleValue"),i=d(i,["const branch = normalize(block.querySelector<HTMLElement>('a[aria-label=\\\"Branch Name\\\"]')?.textContent);",`const branchElement = block.querySelector<HTMLElement>('a[aria-label=\\"Branch Name\\"]');
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
  if (!record.lotNumber) {`,"buildCopartApiRecord target blacklist"),m(t,`${a}
${i}`)}async function V(e,n,t){let r=s.join(n,"versions",t.version),a=s.join(r,"manifest.json");b(r,{recursive:!0});let i=!h(a);if(!i)try{let l=JSON.parse(p(a,"utf8"));i=JSON.stringify(l.files)!==JSON.stringify(t.files)}catch{i=!0}if(i){for(let f of t.files){let c=s.join(r,f.path);await A(k(e,f.path),c,f.sha256)}m(a,JSON.stringify(t,null,2));let u=await Bun.spawn(["bun","install"],{cwd:r,stdout:"inherit",stderr:"inherit",stdin:"ignore"}).exited;if(u!==0)throw Error(`bun install failed with exit code ${u}`)}let o=s.join(r,".playwright-installed");if(!h(o)){let u=await Bun.spawn(["bunx","playwright","install","chromium"],{cwd:r,stdout:"inherit",stderr:"inherit",stdin:"ignore"}).exited;if(u!==0)throw Error(`playwright install failed with exit code ${u}`);m(o,new Date().toISOString())}return z(r,t),m(s.join(n,"current-version.txt"),t.version),r}function y({versionDir:e,manifest:n,baseUrl:t,updateBaseUrl:r,passthroughArgs:a,siteKey:i}){let o=["bun","run",n.entrypoint,"--base-url",t,"--update-base-url",r,...a,...i?["--site",i]:[]];return Bun.spawn(o,{cwd:e,stdout:"inherit",stderr:"inherit",stdin:"inherit",env:process.env})}async function B(){let e=R(process.argv.slice(2));if(!e.publicKeyFile)throw Error("Set AUCTION_COLLECTOR_PUBLIC_KEY_FILE or pass --public-key-file before running the collector bootstrap.");let n=p(e.publicKeyFile,"utf8"),t=await T(e.updateBaseUrl),r=await S(`${e.updateBaseUrl}/manifest.sig`);$(t,r.trim(),n);let a=await V(e.updateBaseUrl,e.runnerHome,t),i=E(e.passthroughArgs),o=P(e.passthroughArgs);if(i.length<=1){let x=await y({versionDir:a,manifest:t,baseUrl:e.baseUrl,updateBaseUrl:e.updateBaseUrl,passthroughArgs:o,siteKey:i[0]}).exited;process.exit(x)}let l=i.map((c)=>y({versionDir:a,manifest:t,baseUrl:e.baseUrl,updateBaseUrl:e.updateBaseUrl,passthroughArgs:o,siteKey:c})),f=(await Promise.all(l.map(async(c)=>await c.exited))).find((c)=>c!==0);process.exit(f??0)}await B().catch((e)=>{console.error(e instanceof Error?e.message:String(e)),process.exit(1)});
