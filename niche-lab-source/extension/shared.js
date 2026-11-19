export const PORTAL='https://etsy-niche-lab-personal.jovialghost256.chatgpt.site';
export function listingFromURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||(u.hostname!=='etsy.com'&&!u.hostname.endsWith('.etsy.com')))return null;const id=u.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?listing\/(\d+)(?:\/|$)/i)?.[1];return id&&Number.isSafeInteger(Number(id))&&Number(id)>0?id:null}catch{return null}}
export function validID(value){return /^\d+$/.test(String(value))&&Number.isSafeInteger(Number(value))&&Number(value)>0}
